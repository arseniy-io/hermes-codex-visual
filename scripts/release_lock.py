"""Cooperative ownership of the shared workspace; see docs/development.md."""

from argparse import ArgumentParser
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import stat
import sys
from uuid import uuid4

SCHEMA = 1
STATE = "release-owner.json"
GUARD = "release-owner.guard"
PHASES = ("editing", "build", "test", "install", "cleanup", "verified", "blocked")


class OwnershipError(RuntimeError):
    pass


def _plain(path):
    # Refuse links/junctions before touching the local coordination files.
    for item in (path, *path.parents):
        try:
            info = item.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0):
            raise OwnershipError(f"Reparse path refused: {item}")


def _paths(root):
    root = Path(os.path.abspath(root))
    folder = root / ".local"
    _plain(folder / STATE)
    _plain(folder / GUARD)
    return folder, folder / STATE, folder / GUARD


def _read(root):
    _, path, _ = _paths(root)
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (ValueError, OSError) as error:
        raise OwnershipError(f"Cannot read coordination state: {error}") from error
    if not isinstance(value, dict) or type(value.get("schema")) is not int or value["schema"] != SCHEMA or "owner" not in value:
        raise OwnershipError("Unknown or incomplete coordination state")
    owner = value["owner"]
    if owner is not None and (not isinstance(owner, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,119}", owner)):
        raise OwnershipError("Invalid owner in coordination state")
    if owner is not None and (value.get("phase") not in PHASES or not isinstance(value.get("task"), str)):
        raise OwnershipError("Incomplete active ownership record")
    return value


def require_owner(root, owner=None, *, if_enabled=False):
    owner = owner if owner is not None else os.environ.get("HCV_RELEASE_OWNER", "")
    value = _read(root)
    if value is None and if_enabled and not owner:
        return {"enabled": False, "owner": None}
    if value is None:
        raise OwnershipError("No ownership record. Run scripts/release_lock.py acquire first.")
    if not owner or value["owner"] != owner:
        holder = value["owner"] or "none (acquire required)"
        raise OwnershipError(f"Shared write refused; current owner: {holder}. See docs/development.md#общая-запись.")
    return value


@contextmanager
def _transaction(root):
    folder, _, guard = _paths(root)
    folder.mkdir(exist_ok=True)
    # Keep this file permanently: unlinking an OS lock can create two locks.
    with guard.open("a+b") as handle:
        if handle.seek(0, 2) == 0:
            handle.write(b"\0")
            handle.flush()
        handle.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            raise OwnershipError("Coordination transaction busy; inspect status and retry once it finishes.") from error
        try:
            yield
        finally:
            handle.seek(0)
            if os.name == "nt":
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def _write(root, value):
    folder, path, _ = _paths(root)
    pending = folder / (STATE + "." + uuid4().hex + ".tmp")
    try:
        with pending.open("x", encoding="utf-8", newline="\n") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(pending, path)
    finally:
        pending.unlink(missing_ok=True)


def change(root, command, owner, task="", phase=None, note=""):
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,119}", owner or ""):
        raise OwnershipError("Use a chat ID or a short ASCII owner ID, without slashes.")
    if len(task) > 300 or any(c in task + note for c in "\r\n"):
        raise OwnershipError("Task/note must be short single-line text.")
    with _transaction(root):
        current = _read(root)
        if command == "acquire" and current and current["owner"] == owner:
            return current
        if command == "acquire":
            if current and current["owner"] is not None:
                raise OwnershipError(f"Busy: {current['owner']} ({current.get('phase')}); no files changed.")
            current = {"schema": SCHEMA, "owner": owner, "task": task, "phase": "editing", "createdAt": _now()}
        else:
            current = dict(require_owner(root, owner))
            if command == "phase":
                if phase not in PHASES:
                    raise OwnershipError("Unknown phase")
                current["phase"] = phase
            elif command == "release":
                current = {"schema": SCHEMA, "owner": None, "lastOwner": owner, "lastTask": current["task"], "note": note}
            else:
                raise OwnershipError("Unknown operation")
        current["updatedAt"] = _now()
        _write(root, current)
        return current


def _now():
    return datetime.now(timezone.utc).isoformat()


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("status", "acquire", "phase", "require", "release"))
    parser.add_argument("--root", type=Path, default=Path(__file__).absolute().parent.parent)
    parser.add_argument("--owner", default=os.environ.get("HCV_RELEASE_OWNER", ""))
    parser.add_argument("--task", default="")
    parser.add_argument("--phase", choices=PHASES)
    parser.add_argument("--note", default="")
    parser.add_argument("--if-enabled", action="store_true")
    args = parser.parse_args()
    try:
        if args.command == "status":
            value = _read(args.root)
            result = {"enabled": value is not None, **(value or {"owner": None})}
        elif args.command == "require":
            result = require_owner(args.root, args.owner, if_enabled=args.if_enabled)
        else:
            result = change(args.root, args.command, args.owner, args.task, args.phase, args.note)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except (OwnershipError, OSError) as error:
        print(str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    raise SystemExit(main())
