"""Immutable, display-only MCP definition snapshots for the Codex-compatible UI.

The provider's arguments and tool schemas are never modified. Only gateway event
copies and UI history projections receive ARG; durable snapshots use the native
message display_metadata sidecar, stripped by the provider request builder.
"""
from __future__ import annotations

import copy
import json
from collections import Counter

ARG = "hermes_tool_labels"
SAVED = "hcv_tool_display"
META_KEYS = ("openai/toolInvocation/invoking", "openai/toolInvocation/invoked")


def _object(value):
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, ValueError):
            return {}
    return value if isinstance(value, dict) else {}


def _field(value, *names):
    for name in names:
        item = value.get(name) if isinstance(value, dict) else getattr(value, name, None)
        if item is not None:
            return item
    return None


def definition(tool):
    """Preserve literals; select only title and the two UI invocation messages."""
    result = {}
    if isinstance(title := _field(tool, "title"), str):
        result["title"] = title
    annotations = _field(tool, "annotations")
    if isinstance(title := _field(annotations, "title"), str):
        result["annotations"] = {"title": title}
    meta = _field(tool, "meta", "_meta")
    if isinstance(meta, dict):
        selected = {key: meta[key] for key in META_KEYS if isinstance(meta.get(key), str)}
        if selected:
            result["_meta"] = selected
    return result


def cache_fields(tool, annotations):
    fields = definition(tool)
    fields["annotations"] = {**annotations, **fields.get("annotations", {})}
    return fields


def _one_live(registered_name):
    """Read the actual owning connection; never reverse a lossy generated name."""
    from tools import mcp_tool as core
    from tools.mcp_tool_schema import mcp_prefixed_tool_name
    from tools.mcp_tool_scope import _resolve_server_key
    from tools.mcp_schema_cache import config_fingerprint, get_cached_entry

    with core._lock:
        server_name = core._mcp_tool_server_names.get(registered_name)
        if not server_name:
            return None
        key = _resolve_server_key(server_name)
        server = core._servers.get(key)
        tools = tuple(getattr(server, "_tools", ())) if server is not None else ()
        config = core._lazy_server_configs.get(key)
    if not tools and isinstance(config, dict):
        entry = get_cached_entry(server_name, config_fingerprint(config))
        tools = tuple(entry.get("tools", ())) if isinstance(entry, dict) else ()
    matches = [tool for tool in tools if isinstance(name := _field(tool, "name"), str)
               and mcp_prefixed_tool_name(server_name, name) == registered_name]
    if len(matches) != 1:
        return None
    raw = matches[0]
    data = definition(raw)
    return {"registered_name": registered_name, "server": server_name,
            "tool": _field(raw, "name"), "definition": data}


def capture(name, args):
    """Called only in the current producer's tool lifecycle, never on history read."""
    try:
        calls = [(name, args)]
        if name == "tool_call":
            args = _object(args)
            entries = args.get("calls") if isinstance(args.get("calls"), list) else [args]
            calls = [(entry.get("name"), entry.get("arguments")) for entry in entries if isinstance(entry, dict)]
        values = []
        for registered, _ in calls:
            if isinstance(registered, str) and registered.startswith("mcp__") and (value := _one_live(registered)) is not None:
                values.append(value)
        return {"version": 1, "tools": values} if values else None
    except Exception:
        # Display metadata must never prevent a real tool call or result append.
        return None


def valid(value):
    value = _object(value)
    tools = value.get("tools")
    if value.get("version") != 1 or not isinstance(tools, list) or not tools:
        return None
    if not all(isinstance(item, dict) and all(isinstance(item.get(key), str) and item[key]
               for key in ("registered_name", "server", "tool")) and isinstance(item.get("definition"), dict)
               for item in tools):
        return None
    return {"version": 1, "tools": [{"registered_name": item["registered_name"],
        "server": item["server"], "tool": item["tool"], "definition": definition(item["definition"])}
        for item in tools]}


def from_message(message):
    display = _object(message.get("display_metadata"))
    result = _object(display.get("tool_result_metadata"))
    return valid(result.get(SAVED))


def labels_for(name, args, snapshot, labels=None):
    if labels is None:
        from agent.display import tool_labels_for_call
        labels = [label.as_payload() for label in tool_labels_for_call(name, _object(args))]
    saved = valid(snapshot)
    if saved is None:
        return labels
    definitions = {item["registered_name"]: item for item in saved["tools"]}
    return [{**label, "display": {"version": 1, **copy.deepcopy(definitions[label["name"]])}}
            if label.get("name") in definitions else dict(label) for label in labels]


def event_args(name, args, snapshot):
    """Copy only for UI projections. Native argument panels already hide this key."""
    result = dict(_object(args))
    if valid(snapshot) is not None:
        result[ARG] = labels_for(name, result, snapshot)
    return result


def begin(session, call_id, name, args):
    saved = capture(name, args)
    if session is not None:
        state = session.setdefault("_hcv_tool_display", {})
        state.pop(call_id, None)  # producer id reuse starts a new occurrence
        if saved is not None:
            state[call_id] = (name, saved)
    return saved


def finish(session, call_id, name, args):
    state = session.setdefault("_hcv_tool_display", {}) if session is not None else {}
    prior = state.pop(call_id, None)
    # The call's own original snapshot wins over a changed MCP catalogue.
    saved = prior[1] if prior and prior[0] == name else capture(name, args)
    # An old lazy schema cache can know identity before tools/list has loaded
    # optional display fields. Enrich only that empty definition at completion.
    if saved is not None and any(not item["definition"] for item in saved["tools"]):
        completed = capture(name, args)
        by_identity = {(item["server"], item["tool"]): item for item in (completed or {}).get("tools", [])}
        saved = {"version": 1, "tools": [item if item["definition"] else
            by_identity.get((item["server"], item["tool"]), item) for item in saved["tools"]]}
    return valid(saved)


def _call_uids(message):
    mapping = _object(message.get("_tool_call_uids", message.get("tool_call_uids")))
    used = Counter()
    result = []
    for call in message.get("tool_calls") or ():
        if not isinstance(call, dict):
            result.append(None)
            continue
        key = str(call.get("id") or call.get("tool_call_id") or "")
        uid = mapping.get(key)
        index = used[key]
        used[key] += 1
        result.append(uid[index] if isinstance(uid, list) and index < len(uid) else uid if isinstance(uid, str) else None)
    return result


def _record(index, uid, snapshot):
    if not isinstance(uid, str) or not uid or snapshot is None:
        return
    if uid not in index:
        index[uid] = snapshot
    elif index[uid] != snapshot:
        index[uid] = None  # conflicting copies are unknown, never a newest-row guess


def project_history(messages, db=None):
    """Copies only. Bind definitions by durable tool occurrence UID, never name/time/queue.

    The optional read-only DB lookup covers paginated REST: a result can be on
    the next page while its assistant call is on this one. A UID is restored by
    Hermes itself from its canonical tool_call_uids/tool_call_uid columns.
    """
    snapshots = {}
    needed = set()
    for message in messages:
        if not isinstance(message, dict):
            continue
        if message.get("role") == "tool":
            _record(snapshots, message.get("_tool_call_uid", message.get("tool_call_uid")), from_message(message))
        elif message.get("role") == "assistant":
            needed.update(uid for uid in _call_uids(message) if isinstance(uid, str) and uid)
    absent = sorted(needed - snapshots.keys())
    if db is not None and absent:
        for start in range(0, len(absent), 200):
            selected = absent[start:start + 200]
            try:
                rows = db._read_all(
                    "SELECT tool_call_uid, display_metadata FROM messages WHERE role = 'tool' "
                    "AND (active = 1 OR compacted = 1) AND tool_call_uid IN (" + ",".join("?" for _ in selected) + ")",
                    tuple(selected))
                for row in rows:
                    _record(snapshots, row["tool_call_uid"], from_message(dict(row)))
            except Exception:
                pass
    output = []
    for message in messages:
        if not isinstance(message, dict):
            output.append(message)
            continue
        if message.get("role") == "tool" and (saved := from_message(message)) is not None:
            output.append({**message, "args": event_args(message.get("tool_name") or message.get("name") or "tool", message.get("args"), saved)})
            continue
        if message.get("role") != "assistant":
            output.append(message)
            continue
        calls = list(message.get("tool_calls") or ())
        changed = False
        for index, uid in enumerate(_call_uids(message)):
            saved = snapshots.get(uid) if isinstance(uid, str) else None
            if saved is None:
                continue
            call = calls[index]
            fn = _object(call.get("function"))
            args = event_args(str(fn.get("name") or "tool"), fn.get("arguments"), saved)
            calls[index] = {**call, "function": {**fn, "arguments": json.dumps(args, ensure_ascii=False)}}
            changed = True
        output.append({**message, "tool_calls": calls} if changed else message)
    return output
