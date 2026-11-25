"""Restore stopped child histories through the existing async delegation owner.

Construction is parent-first; dispatch is deepest-first. Stable stored/subagent
identities and task names come from the checkpoint and are verified against DB.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import time


CONTINUE = ("Продолжи свою остановленную задачу с сохранённой истории. Выполненные вызовы инструментов "
            "и их результаты уже записаны; не запускай их повторно. Прерванные команды завершены, "
            "сначала проверь фактический результат. Вложенные помощники восстановлены в прежних чатах.")


def continuation_prompt(node):
    return CONTINUE + "\n\nИсходная задача этого помощника:\n" + str(node['goal'])


def resume_children(root_agent, checkpoint, *, ui_session_id, owner_transport, owner_session_record):
    from tools.delegate_tool import _get_max_async_children, _get_max_concurrent_children, _load_config
    from tools.delegate_tool_results import _build_child_preserving_parent_tools
    from tools.delegate_tool_child_run import _detach_child, _close_child
    from tools.delegate_tool_dispatch import _Batch, _dispatch_unit

    from tools.delegate_tree_lineage import store_compression_ids
    if checkpoint["owner"]["root_id"] not in store_compression_ids(root_agent._session_db, str(root_agent.session_id)):
        raise ValueError("Root identity changed before continuation")
    canonical = owner_session_record.get('canonical_authority')
    canonical_sid = owner_session_record.get('canonical_root_id')
    canonical_generation = owner_session_record.get('canonical_generation')
    canonical_owner = bool(canonical is not None and
                           canonical.adopted.get(canonical_sid) == (canonical_generation, root_agent) and
                           canonical.executing.get(canonical_sid) == canonical_generation)
    if owner_session_record.get("agent") is not root_agent or (owner_transport is None and not canonical_owner):
        raise ValueError("Continuation transport/owner is not current")
    clear = getattr(root_agent, "clear_interrupt", None)
    if callable(clear):
        clear(hard_cancel=True)
    parents = {identity: root_agent for identity in store_compression_ids(root_agent._session_db, str(root_agent.session_id))}
    built, unresolved = [], [node for node in checkpoint["nodes"] if node.get("resumable") is True]
    try:
        while unresolved:
            next_round = []
            for node in unresolved:
                parent = parents.get(node["parent_stored_id"])
                if parent is None:
                    next_round.append(node)
                    continue
                cwd = node.get("cwd")
                if cwd and not Path(cwd).is_dir():
                    raise ValueError("Stopped child workspace no longer exists")
                child = _build_child_preserving_parent_tools(
                    task_index=len(built), goal=node["goal"], context=node.get('context'), toolsets=None,
                    model=node.get("model"), max_iterations=_load_config().get("max_iterations", 90),
                    task_count=len(checkpoint["nodes"]), parent_agent=parent,
                    profile_home=Path(node["profile_home"]), task_name=node.get("task_name"),
                    resume_receipt=node,
                )
                if node.get("provider") and getattr(child, "provider", None) != node["provider"]:
                    _close_child(child, "Changed provider while restoring stopped child")
                    raise ValueError("Child provider route changed; continuation refused")
                if str(child.session_id) != node["stored_id"]:
                    _close_child(child, "Mismatched restored child identity")
                    raise ValueError("Child continuation changed its durable identity")
                parents.update({identity: child for identity in store_compression_ids(child._session_db, str(child.session_id))})
                child._hcv_resume_prompt = continuation_prompt(node)
                child._delegate_images = list(node.get('images') or [])
                built.append((node, parent, child))
            if len(next_round) == len(unresolved):
                raise ValueError("Incomplete/cyclic parent tree in checkpoint")
            unresolved = next_round
    except BaseException as exc:
        for _node, parent, child in reversed(built):
            _detach_child(parent, child)
            _close_child(child, "Unstarted child continuation rolled back")
        raise ValueError("Child continuation preparation failed: " + str(exc)) from exc

    # Native orchestrator children wait for their children synchronously. Run
    # descendants inside the registered parent's worker before its next model
    # request. Only top-level children use async completion units.
    by_parent = {}
    for node, parent, child in built:
        by_parent.setdefault(str(parent.session_id), []).append((node, parent, child))

    def child_context(parent):
        from tools.delegate_tool import _run_single_child
        from tools.delegate_tool_results import _finalize_child_results
        from tools.daemon_pool import DaemonThreadPoolExecutor
        import contextvars
        siblings = by_parent.get(str(parent.session_id), [])
        if not siblings:
            return ""
        tasks = [{"goal": n['goal'], "task_name": n.get("task_name"), "agent_path": n.get("agent_path")}
                 for n, _p, _c in siblings]
        executor = DaemonThreadPoolExecutor(max_workers=min(len(siblings), _get_max_concurrent_children()))
        futures = []
        try:
            for index, (node, _owner, child) in enumerate(siblings):
                future = executor.submit(contextvars.copy_context().run, _run_single_child,
                                         index, node['goal'], child, parent,
                                         owner_session_id=ui_session_id, owner_transport=owner_transport,
                                         owner_session_record=owner_session_record)
                futures.append(future)
            results = [future.result() for future in futures]
            _finalize_child_results(results, tasks, [(i, task, sibling[2]) for i, (task, sibling)
                                                   in enumerate(zip(tasks, siblings))], parent)
            return ("Результаты восстановленных вложенных помощников. Это новые подтверждённые результаты "
                    "после продолжения; прежние завершённые вызовы не повторялись:\n" +
                    json.dumps({"results": results}, ensure_ascii=False))
        finally:
            executor.shutdown(wait=False)

    for _node, _parent, child in built:
        child._hcv_resume_before_run = lambda child=child: child_context(child)
    receipts = []
    from agent.runtime_session_store import RuntimeSessionStore
    managed_store = getattr(root_agent, "_session_db", None)
    if isinstance(managed_store, RuntimeSessionStore):
        root_row = managed_store.get_session(str(root_agent.session_id))
        completion_key = str(root_row.get("session_key") or "")
        completion_ui = str(root_agent.session_id)
    elif canonical_owner:
        completion_key = str(owner_session_record['canonical_completion_key'])
        completion_ui = str(owner_session_record['canonical_origin_ui_session_id'])
    else:
        completion_key, completion_ui = str(root_agent.session_id), ui_session_id
    groups = {}
    for node, parent, child in built:
        if parent is root_agent:
            groups.setdefault(node.get('delegation_id') or node['stored_id'], []).append((node, parent, child))
    try:
        for members in groups.values():
            token = hashlib.sha256('|'.join(node['stored_id'] for node, _p, _c in members).encode()).hexdigest()[:16]
            unit_id = "hcv-resume-" + checkpoint["checkpoint_id"] + "-" + token
            tasks = [{'goal': node['goal'], 'task_name': node.get('task_name'),
                      'agent_path': node.get('agent_path')} for node, _p, _c in members]
            for _node, _parent, child in members:
                child._delegation_id = unit_id
                ref = getattr(child, '_progress_identity_ref', None)
                if isinstance(ref, dict):
                    ref['delegation_id'] = unit_id
                _detach_child(root_agent, child)
            unit = _Batch(tasks, [(i, task, member[2]) for i, (task, member) in enumerate(zip(tasks, members))],
                          root_agent, {'model': members[0][0].get('model')},
                          None, getattr(members[0][2], "_delegate_role", "leaf"), _get_max_concurrent_children(),
                          unit_id, [], [], "", ui_session_id, owner_transport, owner_session_record,
                          True, time.monotonic(), unit_id=unit_id, live_home=Path(members[0][0]["profile_home"]))
            result = _dispatch_unit(unit, unit_id, None, {
                "session_key": completion_key, "origin_ui_session_id": completion_ui,
                "origin_session_id": "", "parent_session_id": str(root_agent.session_id),
                "max_async_children": _get_max_async_children(),
            })
            if result.get("status") != "dispatched":
                raise RuntimeError("Child continuation dispatch refused: " + str(result.get("error", "unknown")))
            receipts.extend({"stored_id": node["stored_id"], "subagent_id": node["subagent_id"],
                             "parent_stored_id": node["parent_stored_id"], "delegation_id": unit_id}
                            for node, _p, _c in members)
    except BaseException as exc:
        dispatched = {receipt["stored_id"] for receipt in receipts}
        # A dispatched top-level batch owns its prepared descendants too. A
        # later independent unit refusing dispatch must not close those live
        # descendants while their parent is already restoring/awaiting them.
        protected = set(dispatched)
        while True:
            expanded = protected | {node['stored_id'] for node, parent, _child in built
                                    if str(parent.session_id) in protected}
            if expanded == protected:
                break
            protected = expanded
        for node, parent, child in reversed(built):
            if node["stored_id"] not in protected:
                _detach_child(parent, child)
                _close_child(child, "Unstarted child continuation rolled back")
        # Already dispatched children are genuine live work. Never retry this
        # ambiguous continuation automatically or pretend it was rolled back.
        raise RuntimeError("Child continuation dispatch unconfirmed: " + str(exc)) from exc
    receipts.extend({"stored_id": node["stored_id"], "subagent_id": node["subagent_id"],
                     "parent_stored_id": node["parent_stored_id"], "mode": "parent_wait"}
                    for node, parent, _child in built if str(parent.session_id) != str(root_agent.session_id))
    return receipts
