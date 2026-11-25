"""Stage an explicit task_name data contract against the verified Hermes source.

This writes only .local/hermes-agent-names-check/candidate. It neither installs the
candidate nor changes the separate session_authority delegation queue repair.
"""

from __future__ import annotations

import ast
from hashlib import sha256
import json
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CORE = Path(os.environ["LOCALAPPDATA"]) / "hermes" / "hermes-agent"
OUT = ROOT / ".local" / "hermes-agent-names-check" / "candidate"
EXPECTED = {
    "agent/delegation_provider.py": "614e2ffbd9219ca0645928461856d6c15682295f37b5ca03342c1a7e9f7962a4",
    "hermes_state_worker_lifecycle.py": "6983a1b5f175530aade16140fcfd434f74bbdac842f74a8d52a86ab79bb9b356",
    "run_agent.py": "9858d5c0971d268b5814a5adc36d64e669a2b023b0ba0ceeb58498c89e9b88d0",
    "tools/delegate_tool_tasks.py": "5cee5ec897c79dc7b9d3aa2cbb43f8ca94ce5a11e784d2a9374d7e37b935b165",
    "tools/delegate_tool.py": "57532e4efe844c15f218e87766411217a664d7ed290b9563a2e86c56a8657e78",
    "tools/delegate_tool_progress.py": "ca7c48745fd6c722724be89be59d70cb90714d4fc687ba6841e7c90762d68e56",
    "tools/delegate_tool_child_run.py": "97a71af068c88bfe4a6e40243177518a2640747650433d373b80e975639ffef9",
    "tools/delegate_tool_dispatch.py": "76ee33f6168e2764e3945392ebd1851e675805c537b19cc4cf948a58850ca456",
    "tools/delegate_tool_registry.py": "4a8978dc5105c7ba473c0cac6507e54e819462c2103c42c33ad65e2abb2a2b21",
    "tools/async_delegation.py": "e070e452a1145cc95a6e45d69e905c8a2fb32aee9402c15dbb8915ffddc03431",
    "tools/async_delegation_worker.py": "6c977ff3b82174296c0688d167b6816a0b5edf963ef148b113b0d20704e545f5",
    "gateway/session_worker_delegation.py": "1c46e330cac7b87f61c213aaf1302667e5c32867dc98673702bd100322cae373",
    "tui_gateway/tool_progress.py": "e051fcbc0ed5d966113f5365231872e7d268fd13d3e25556d3a0af6ed238c46b",
    "gateway/session_ancillary.py": "066990f1fb538e274c40e5463351942eed2652131ff5929eb4ebe157795a29e2",
}


def replace_once(text: str, before: str, after: str) -> str:
    if text.count(before) != 1:
        raise RuntimeError("Hermes source no longer matches the verified agent identity patch point: " + repr(before[:100]))
    return text.replace(before, after, 1)


def helper_import(text: str) -> str:
    body = ast.parse(text).body
    line = 0
    for node in body:
        if (isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str)
                or isinstance(node, ast.ImportFrom) and node.module == "__future__"):
            line = node.end_lineno
        else:
            break
    lines = text.splitlines(keepends=True)
    lines.insert(line, "\nimport tools.hcv_agent_names as _hcv_agent_names\n")
    return "".join(lines)


def delegate_tool(text: str) -> str:
    text = helper_import(text)
    text = replace_once(text,
        '    credentials_cfg: Optional[dict[str, Any]] = None,\n',
        '    credentials_cfg: Optional[dict[str, Any]] = None, task_name: Optional[str] = None,\n')
    text = replace_once(text,
        '    override_service_tier: Optional[str] = None,  # a route\'s checked speed tier (tools/delegate_tool_tuning.py)\n',
        '    override_service_tier: Optional[str] = None,  # a route\'s checked speed tier (tools/delegate_tool_tuning.py)\n'
        '    task_name: Optional[str] = None,\n')
    text = replace_once(text, '    child_session_ref: dict[str, Any] = {}\n',
        '    child_session_ref: dict[str, Any] = _hcv_agent_names.make_identity(task_name, parent_agent)\n')
    text = replace_once(text, '    _reserve_child_transcript(child)\n',
        '    _hcv_agent_names.attach_child_identity(child, child_session_ref)\n    _reserve_child_transcript(child)\n')
    text = replace_once(text, '                task_index=i, goal=t["goal"], context=_child_context,\n',
        '                task_index=i, goal=t["goal"], context=_child_context, task_name=t.get("task_name"),\n')
    text = replace_once(text,
        '    task_list, err = _normalize_task_list(goal, context, tasks, output_schema, top_role, max_children)\n',
        '    task_list, err = _normalize_task_list(goal, context, tasks, output_schema, top_role, max_children, task_name=task_name)\n'
        '    if not err:\n        task_list, err = _hcv_agent_names.prepare_tasks(task_list, parent_agent)\n')
    text = replace_once(text,
        '                        "goal": _p(\n',
        '                        "task_name": _p(\n'
        '                            "string",\n'
        '                            "Choose a concise English snake_case name for this subagent, e.g. "\n'
        '                            "method_review or scenario_review. This explicit name is shown unchanged "\n'
        '                            "apart from path formatting; keep the full assignment in goal.",\n'
        '                            pattern=_hcv_agent_names.TASK_NAME_PATTERN,\n'
        '                        ),\n'
        '                        "goal": _p(\n')
    text = replace_once(text, '                    "required": ["goal"],\n',
        '                    "required": ["goal", "task_name"],\n')
    text = replace_once(text,
        '        tasks["items"] = {**tasks["items"], "required": ["goal", "group"]}\n',
        '        tasks["items"] = {**tasks["items"], "required": ["goal", "task_name", "group"]}\n')
    text = replace_once(text,
        '        goal=args.get("goal"), context=args.get("context"), tasks=_strip_model_hidden_task_fields(args.get("tasks")),\n',
        '        goal=args.get("goal"), context=args.get("context"), tasks=_strip_model_hidden_task_fields(args.get("tasks")),\n'
        '        task_name=args.get("task_name"),\n')
    text = replace_once(text,
        '    compat_args=("goal", "context", "images", "max_iterations", "output_schema", "role"),\n',
        '    compat_args=("goal", "context", "images", "max_iterations", "output_schema", "role", "task_name"),\n')
    return text


def task_list(text: str) -> str:
    text = replace_once(text,
        '    goal, context, tasks, output_schema, top_role: str, max_children: int\n',
        '    goal, context, tasks, output_schema, top_role: str, max_children: int, task_name=None\n')
    return replace_once(text,
        '        task_list = [{"goal": goal, "context": context, "role": top_role}]\n',
        '        task_list = [{"goal": goal, "context": context, "role": top_role,\n'
        '                      **({"task_name": task_name} if task_name is not None else {})}]\n')


def parent_dispatch(text: str) -> str:
    return replace_once(text,
        '            tasks=_strip_model_hidden_task_fields(function_args.get("tasks")),\n',
        '            tasks=_strip_model_hidden_task_fields(function_args.get("tasks")),\n'
        '            task_name=function_args.get("task_name"),\n')


def provider_contract(text: str) -> str:
    return replace_once(text,
        '    "goal", "context", "index", "output_schema", "images", "group", "role", "toolsets",\n',
        '    "goal", "context", "index", "output_schema", "images", "group", "role", "toolsets", "task_name", "agent_path",\n')


def worker_constructor(text: str) -> str:
    return replace_once(text,
        "_CONSTRUCTOR_CONFIG = frozenset({'max_iterations', 'max_tokens', 'reasoning_config', 'yolo_mode'})\n",
        "_CONSTRUCTOR_CONFIG = frozenset({'max_iterations', 'max_tokens', 'reasoning_config', 'yolo_mode', '_task_name', '_agent_path'})\n")


def delegate_progress(text: str) -> str:
    return replace_once(text,
        '        for src, dst in (("session_id", "child_session_id"), ("delegation_id", "delegation_id")):\n',
        '        for src, dst in (("session_id", "child_session_id"), ("delegation_id", "delegation_id"),\n'
        '                         ("task_name", "task_name"), ("agent_path", "agent_path")):\n')


def child_run(text: str) -> str:
    text = helper_import(text)
    text = replace_once(text,
        '            model_config={"_delegate_from": parent_sid} if parent_sid else None,\n',
        '            model_config={**({"_delegate_from": parent_sid} if parent_sid else {}),\n'
        '                          **_hcv_agent_names.session_identity(child)} or None,\n')
    text = replace_once(text,
        '        "task_index": idx, "status": status, "summary": None, "error": error, "api_calls": 0,\n',
        '        "task_index": idx, "status": status, "summary": None, "error": error, "api_calls": 0,\n'
        '        **_hcv_agent_names.child_identity(child),\n')
    text = replace_once(text, '        "goal": goal,\n',
        '        "goal": goal, **_hcv_agent_names.child_identity(child),\n')
    text = replace_once(text, '        "task_index": task_index,\n        "status": status,\n',
        '        "task_index": task_index, **_hcv_agent_names.child_identity(child),\n        "status": status,\n')
    return text


def dispatch(text: str) -> str:
    text = helper_import(text)
    text = replace_once(text,
        '    combined: dict[str, Any] = {"results": results, "total_duration_seconds": total_duration}\n',
        '    combined: dict[str, Any] = {"results": results, "total_duration_seconds": total_duration,\n'
        '                                **_hcv_agent_names.task_metadata(batch.task_list)}\n')
    text = replace_once(text,
        '        "delegation_id": batch.live_deleg_id or units[0][1], "goals": goals,\n',
        '        "delegation_id": batch.live_deleg_id or units[0][1], "goals": goals,\n'
        '        **_hcv_agent_names.task_metadata(batch.task_list),\n')
    text = replace_once(text,
        '        goals=[t["goal"] for t in unit.task_list], context=unit.context,\n',
        '        goals=[t["goal"] for t in unit.task_list], context=unit.context,\n'
        '        **_hcv_agent_names.task_metadata(unit.task_list),\n')
    return text


def registry(text: str) -> str:
    text = helper_import(text)
    text = replace_once(text,
        '    return {"subagent_id": task_id, "goal": record.get("goal"), "delegation_id": record.get("delegation_id")}\n',
        '    return {"subagent_id": task_id, "goal": record.get("goal"), "delegation_id": record.get("delegation_id"),\n'
        '            **_hcv_agent_names.identity_fields(record)}\n')
    text = replace_once(text,
        '        _recent_subagents[sid] = {k: record.get(k) for k in ("goal", "delegation_id", "owner_agent_session_id")}\n',
        '        _recent_subagents[sid] = {**{k: record.get(k) for k in ("goal", "delegation_id", "owner_agent_session_id")},\n'
        '                                  **_hcv_agent_names.identity_fields(record)}\n')
    text = replace_once(text, '            "goal": r.get("goal"),\n',
        '            "goal": r.get("goal"), **_hcv_agent_names.identity_fields(r),\n')
    return text


def async_delegation(text: str) -> str:
    text = helper_import(text)
    text = replace_once(text,
        'for key in ("goal", "goals", "context", "toolsets", "role", "model", "is_batch", "task_indexes", "task_transcripts", *_ROUTING_KEYS)\n',
        'for key in ("goal", "goals", "context", "toolsets", "role", "model", "is_batch", "task_indexes", "task_transcripts",\n'
        '                    "task_names", "agent_paths", *_ROUTING_KEYS)\n')
    # Both the shared dispatch core and its batch public entry accept these optional, call-indexed fields.
    before = '    task_transcripts: Optional[dict[str, str]] = None,\n'
    if text.count(before) != 2:
        raise RuntimeError("Hermes async delegation signature changed.")
    text = text.replace(before, before + '    task_names: Optional[list[Optional[str]]] = None,\n'
        '    agent_paths: Optional[list[Optional[str]]] = None,\n')
    text = replace_once(text,
        '        "delegation_id": delegation_id, "goal": goal, **({"goals": list(goals)} if is_batch else {}),\n',
        '        "delegation_id": delegation_id, "goal": goal, **({"goals": list(goals)} if is_batch else {}),\n'
        '        **_hcv_agent_names.stored_metadata({"task_names": task_names, "agent_paths": agent_paths}),\n')
    text = replace_once(text, '        task_indexes=task_indexes, task_transcripts=task_transcripts,\n',
        '        task_indexes=task_indexes, task_transcripts=task_transcripts, task_names=task_names, agent_paths=agent_paths,\n')
    text = replace_once(text,
        '    return [recorded.get(i) or {"task_index": i, "status": "unknown", "summary": None, "error": error} for i in indexes]\n',
        '    return [{**(recorded.get(i) or {"task_index": i, "status": "unknown", "summary": None, "error": error}),\n'
        '             **_hcv_agent_names.indexed_identity(task, i)} for i in indexes]\n')
    text = replace_once(text,
        '                "parent_session_id": parent_id, "goal": task.get("goal", ""), "goals": task.get("goals"),\n',
        '                "parent_session_id": parent_id, "goal": task.get("goal", ""), "goals": task.get("goals"),\n'
        '                **_hcv_agent_names.recovery_metadata(task),\n')
    text = replace_once(text,
        '            result = {"status": "unknown", "summary": None, "error": event["error"], **diagnostics,\n',
        '            result = {"status": "unknown", "summary": None, "error": event["error"], **diagnostics,\n'
        '                      **_hcv_agent_names.recovery_metadata(task),\n')
    text = replace_once(text,
        '                "delegation_id": delegation_id, "task_index": index, "status": status,\n',
        '                "delegation_id": delegation_id, "task_index": index, "status": status,\n'
        '                **_hcv_agent_names.indexed_identity(task, index),\n')
    text = replace_once(text, '    result = redact_child_result(result, force=False)\n',
        '    result = _hcv_agent_names.result_identities(redact_child_result(result, force=False), record)\n')
    text = replace_once(text,
        '        "goal": record.get("goal", ""), **({"goals": record.get("goals")} if is_batch else {}),\n',
        '        "goal": record.get("goal", ""), **({"goals": record.get("goals")} if is_batch else {}),\n'
        '        **_hcv_agent_names.stored_metadata(record),\n')
    return text


def async_worker(text: str) -> str:
    return replace_once(text,
        "for key in ('goal', 'goals', 'context', 'toolsets', 'role', 'model', 'is_batch', 'task_indexes')\n",
        "for key in ('goal', 'goals', 'context', 'toolsets', 'role', 'model', 'is_batch', 'task_indexes', 'task_names', 'agent_paths')\n")


def worker_owner(text: str) -> str:
    return replace_once(text,
        "_TASK_KEYS = {'goal', 'goals', 'context', 'toolsets', 'role', 'model', 'is_batch', 'task_indexes'}\n",
        "_TASK_KEYS = {'goal', 'goals', 'context', 'toolsets', 'role', 'model', 'is_batch', 'task_indexes', 'task_names', 'agent_paths'}\n")


def wire(text: str) -> str:
    return replace_once(text, '_SUBAGENT_FIELDS = (\n',
        '_SUBAGENT_FIELDS = (\n    ("task_name", bool, str), ("agent_path", bool, str),\n')


def roster(text: str) -> str:
    text = helper_import(text)
    return replace_once(text,
        "    return {**{key: record.get(key) for key in _SUBAGENT_FIELDS},\n",
        "    return {**{key: record.get(key) for key in _SUBAGENT_FIELDS}, **_hcv_agent_names.identity_fields(record),\n")


TRANSFORMS = {
    "agent/delegation_provider.py": provider_contract,
    "hermes_state_worker_lifecycle.py": worker_constructor,
    "run_agent.py": parent_dispatch,
    "tools/delegate_tool_tasks.py": task_list,
    "tools/delegate_tool.py": delegate_tool,
    "tools/delegate_tool_progress.py": delegate_progress,
    "tools/delegate_tool_child_run.py": child_run,
    "tools/delegate_tool_dispatch.py": dispatch,
    "tools/delegate_tool_registry.py": registry,
    "tools/async_delegation.py": async_delegation,
    "tools/async_delegation_worker.py": async_worker,
    "gateway/session_worker_delegation.py": worker_owner,
    "tui_gateway/tool_progress.py": wire,
    "gateway/session_ancillary.py": roster,
}


def candidates(core: Path = CORE) -> tuple[dict[str, bytes], dict[str, bytes]]:
    originals, patched = {}, {}
    for name, transform in TRANSFORMS.items():
        raw = (core / name).read_bytes()
        if sha256(raw).hexdigest() != EXPECTED[name]:
            raise RuntimeError("Installed Hermes changed; refusing to stage an unverified source: " + name)
        original = raw.decode("utf-8")
        newline = "\r\n" if "\r\n" in original else "\n"
        result = transform(original.replace("\r\n", "\n"))
        ast.parse(result, filename=name)
        originals[name] = raw
        patched[name] = result.replace("\n", newline).encode("utf-8")
    patched["tools/hcv_agent_names.py"] = (ROOT / "source/hermes-agent-names/identity.py").read_bytes()
    return originals, patched


def main() -> None:
    originals, patched = candidates()
    manifest = {}
    for name, raw in patched.items():
        path = OUT / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
        manifest[name] = {"original": sha256(originals[name]).hexdigest() if name in originals else None,
                          "candidate": sha256(raw).hexdigest()}
    (OUT.parent / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("Staged explicit agent identities:", len(patched), "files; installed Hermes was not changed.")


if __name__ == "__main__":
    main()
