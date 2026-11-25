"""Synthetic agent-lifecycle additions; called only in its isolated profile seed."""
from __future__ import annotations

import base64
import copy
import difflib
import json
from pathlib import Path

SECOND_TASK = "Примени сохранённые правки субагента к четырём контрольным файлам."
SECOND_FINAL = "Проверка завершена. Четыре файла субагента сохранены."


def _has_assistant_text(row):
    return row.get("role") == "assistant" and isinstance(row.get("content"), str) and bool(row["content"].strip())


def with_child_timeline(messages, *, worker, child, project_folder, now):
    messages = copy.deepcopy(messages)
    if sum(_has_assistant_text(row) for row in messages) != 104:
        raise AssertionError("Expected the original 104 visible assistant messages")
    root = Path(project_folder).resolve(strict=True)
    if not (root / ".git").is_dir() or not (root / "fixture-note.md").is_file():
        raise AssertionError("Timeline seed requires the synthetic Git fixture")
    first_start = now - 2 * 3600
    first_final = first_start + 120
    first_end = first_start + 140
    turn1 = worker + "-timeline-turn-1"
    turn2 = worker + "-timeline-turn-2"
    target = worker == "fixture-agent-method"
    cwd = root / "child-fixture" if target else root
    for index, row in enumerate(messages):
        metadata = row.get("display_metadata") or {}
        if row.get("display_kind") == "hidden" or metadata.get("model_only") is True:
            continue
        phase = "input" if row.get("role") == "user" else "tool" if row.get("role") == "tool" else "work"
        row["timestamp"] = first_start + index
        row["display_metadata"] = {**metadata, "hcv_timeline": {
            "version": 1, "turnId": turn1, "turnStartedAtMs": first_start * 1000,
            "opensExchange": True, "phase": phase, "cwd": str(cwd), "cwdBackend": "local"}}
    messages[-1]["timestamp"] = first_end
    messages[-1]["display_metadata"]["hcv_timeline"].update(
        phase="final", finalAssistantStartedAtMs=first_final * 1000, completedAtMs=first_end * 1000)
    if not target:
        return messages
    if cwd.exists():
        raise AssertionError("Refusing to overwrite an existing child-fixture")
    cwd.mkdir()
    if not cwd.resolve().is_relative_to(root):
        raise AssertionError("Child fixture leaves its synthetic repository")
    before = {"alpha.txt": "alpha base\n", "beta.txt": "beta base\n", "gamma.txt": None, "delta.txt": "delta base\n"}
    after = {"alpha.txt": "alpha checked twice\n", "beta.txt": "beta checked\n", "gamma.txt": "gamma created\nsecond gamma\n",
        "delta.txt": "delta checked\nextra delta\n"}
    operations = [
        ("alpha.txt", before["alpha.txt"], "alpha checked\n"),
        ("beta.txt", before["beta.txt"], after["beta.txt"]),
        ("gamma.txt", None, after["gamma.txt"]),
        ("delta.txt", before["delta.txt"], after["delta.txt"]),
        ("alpha.txt", "alpha checked\n", after["alpha.txt"]),
    ]
    for name, content in after.items():
        (cwd / name).write_bytes(content.encode("utf-8"))
    started = now - 20 * 60
    final_started = started + 16
    completed = started + 25
    def metadata(phase):
        return {"hcv_timeline": {"version": 1, "turnId": turn2, "turnStartedAtMs": started * 1000,
            "opensExchange": True, "phase": phase, "cwd": str(cwd), "cwdBackend": "local"}}
    user_uid = worker + "-timeline2-user"
    new = [{"role": "user", "content": SECOND_TASK, "message_uid": user_uid,
        "timestamp": started, "display_metadata": metadata("input")}]
    calls = []
    tools = []
    uids = {}
    patches = []
    for index, (name, old, changed) in enumerate(operations):
        call_id = worker + "-timeline-patch-" + str(index)
        uid = worker + "-timeline-patch-uid-" + str(index)
        uids[call_id] = uid
        tool = "write_file" if old is None else "patch"
        args = {"path": name, "content": changed} if old is None else {"path": name, "old": old, "new": changed}
        patch = "".join(difflib.unified_diff((old or "").splitlines(keepends=True), changed.splitlines(keepends=True),
            fromfile="/dev/null" if old is None else "a/" + name, tofile="b/" + name))
        patches.append(patch)
        calls.append({"id": call_id, "type": "function", "function": {"name": tool, "arguments": json.dumps(args)}})
        tools.append({"role": "tool", "name": tool, "tool_name": tool, "tool_call_id": call_id,
            "_tool_call_uid": uid, "message_uid": worker + "-timeline2-result-" + str(index),
            "timestamp": started + 2 + index, "display_metadata": metadata("tool"),
            "content": json.dumps({"success": True, "diff": patch, "operation": "create" if old is None else "edit"})})
    new.append({"role": "assistant", "content": None, "tool_calls": calls, "_tool_call_uids": uids,
        "message_uid": worker + "-timeline2-calls", "timestamp": started + 1, "display_metadata": metadata("work")})
    new.extend(tools)
    final_metadata = metadata("final")
    final_metadata["hcv_timeline"].update(finalAssistantStartedAtMs=final_started * 1000, completedAtMs=completed * 1000)
    new.append({"role": "assistant", "content": SECOND_FINAL, "message_uid": worker + "-timeline2-final",
        "timestamp": completed, "display_metadata": final_metadata})
    messages.extend(new)
    encode = lambda value: base64.b64encode(value.encode("utf-8")).decode() if value is not None else None
    control = (root / "fixture-note.md").read_bytes()
    manifest = {"worker": worker, "child": child, "firstTurnId": turn1, "secondTurnId": turn2,
        "secondUserUid": user_uid, "firstStartedAtMs": first_start * 1000,
        "firstFinalStartedAtMs": first_final * 1000, "firstCompletedAtMs": first_end * 1000,
        "secondStartedAtMs": started * 1000, "secondFinalStartedAtMs": final_started * 1000,
        "secondCompletedAtMs": completed * 1000, "secondTask": SECOND_TASK, "secondFinal": SECOND_FINAL,
        "parentControl": {"path": "fixture-note.md", "bytes": base64.b64encode(control).decode()},
        "files": [{"path": "child-fixture/" + name, "before": encode(before[name]), "after": encode(after[name])} for name in before],
        "patches": patches, "counts": {"added": 7, "removed": 4}, "visibleAssistantCount": 105}
    (cwd / ".timeline-parity.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return messages
