"""Explicit delegation identity, supplied by the parent rather than inferred from a goal.

Codex's parent chooses ``task_name``; Desktop formats the last ``agent_path`` segment.
These helpers only carry that identity. They never translate or summarize a task.
"""

from __future__ import annotations

import json
import re
from typing import Any


TASK_NAME_PATTERN = r"^[a-z0-9_]+$"
IDENTITY_KEYS = ("task_name", "agent_path")
TASK_METADATA_KEYS = ("task_names", "agent_paths")


def identity_fields(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    return {key: value[key] for key in IDENTITY_KEYS if isinstance(value.get(key), str) and value[key]}


def child_identity(child: Any) -> dict[str, str]:
    return identity_fields({key: getattr(child, "_" + key, None) for key in IDENTITY_KEYS})


def session_identity(child: Any) -> dict[str, str]:
    return {"_" + key: value for key, value in child_identity(child).items()}


def _parent_path(parent: Any) -> str:
    path = getattr(parent, "_agent_path", None)
    if isinstance(path, str) and path:
        return path
    config = getattr(parent, "_session_init_model_config", None)
    if isinstance(config, dict) and isinstance(config.get("_agent_path"), str) and config["_agent_path"]:
        return config["_agent_path"]
    # A resumed named child can delegate again. Read its stored path instead of assigning a new root.
    db, sid = getattr(parent, "_session_db", None), getattr(parent, "session_id", None)
    if db is not None and isinstance(sid, str) and sid:
        try:
            from hermes_state import AsyncSessionDB
            from agent.runtime_session_store import call_off_event_loop
            if isinstance(db, AsyncSessionDB):
                db = db._db
            row = call_off_event_loop(db.get_session, sid)
            config = row.get("model_config") if isinstance(row, dict) else None
            if isinstance(config, str):
                config = json.loads(config)
            if isinstance(config, dict) and isinstance(config.get("_agent_path"), str) and config["_agent_path"]:
                return config["_agent_path"]
        except Exception as exc:
            raise ValueError("Cannot restore the parent agent_path from its own session metadata.") from exc
    return "/root"


def make_identity(task_name: Any, parent: Any) -> dict[str, str]:
    if task_name is None:
        return {}
    if not isinstance(task_name, str) or re.fullmatch(TASK_NAME_PATTERN, task_name) is None:
        raise ValueError("task_name must be a concise English snake_case name, for example method_review.")
    return {"task_name": task_name, "agent_path": _parent_path(parent) + "/" + task_name}


def prepare_tasks(tasks: list[dict[str, Any]], parent: Any) -> tuple[list[dict[str, Any]] | None, str | None]:
    """Copy tasks, validate explicit names and generate paths before any child can be published."""
    prepared = []
    for index, task in enumerate(tasks):
        try:
            identity = make_identity(task.get("task_name"), parent)
        except ValueError as exc:
            return None, f"Task {index}: {exc}"
        # A caller controls task_name, not the parent path. An unnamed legacy task stays unnamed.
        prepared.append({**{key: value for key, value in task.items() if key != "agent_path"}, **identity})
    return prepared, None


def attach_child_identity(child: Any, identity: dict[str, Any]) -> None:
    for key, value in identity_fields(identity).items():
        setattr(child, "_" + key, value)
        config = getattr(child, "_session_init_model_config", None)
        if isinstance(config, dict):
            config["_" + key] = value


def task_metadata(tasks: list[dict[str, Any]]) -> dict[str, list[str | None]]:
    if not any(identity_fields(task) for task in tasks):
        return {}
    return {plural: [identity_fields(task).get(key) for task in tasks]
            for key, plural in zip(IDENTITY_KEYS, TASK_METADATA_KEYS)}


def stored_metadata(record: Any) -> dict[str, list[str | None]]:
    if not isinstance(record, dict):
        return {}
    return {key: list(record[key]) for key in TASK_METADATA_KEYS if isinstance(record.get(key), list)}


def recovery_metadata(record: dict[str, Any]) -> dict[str, Any]:
    return {**stored_metadata(record),
            **({"task_indexes": list(record["task_indexes"])} if isinstance(record.get("task_indexes"), list) else {})}


def indexed_identity(record: dict[str, Any], index: Any) -> dict[str, str]:
    if not isinstance(index, int) or isinstance(index, bool) or index < 0:
        return {}
    identity = {}
    for key, plural in zip(IDENTITY_KEYS, TASK_METADATA_KEYS):
        values = record.get(plural)
        if isinstance(values, list) and index < len(values) and isinstance(values[index], str) and values[index]:
            identity[key] = values[index]
    return identity


def result_identities(result: Any, record: dict[str, Any]) -> Any:
    if not isinstance(result, dict) or not stored_metadata(record):
        return result
    enriched = {**result, **stored_metadata(record)}
    if isinstance(result.get("results"), list):
        enriched["results"] = [
            {**entry, **indexed_identity(record, entry.get("task_index"))} if isinstance(entry, dict) else entry
            for entry in result["results"]]
    return enriched
