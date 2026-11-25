"""Prepare, inspect and safely hand off exact text-file changes to a release owner.

All preparation and recovery material lives in .local.  Only apply writes
shared inputs, and it requires the existing cooperative release ownership.
The operation is journaled, but replacing multiple files is NOT atomic.
Complete hard-link backups initially share the original file, so a writer
outside that cooperative ownership can modify both in place. Recheck bytes
and identity before each operation; after interruption inspect the journal and
paths rather than retrying or automatically rolling back.
"""

from argparse import ArgumentParser
import base64
from datetime import datetime, timezone
import difflib
from hashlib import sha256
import importlib.util
import json
import os
from pathlib import Path, PureWindowsPath
import re
import stat
import sys
from uuid import uuid4


SCHEMA = 1
ALLOWED = {"source", "verification", "scripts", "docs"}
ROOT_FILES = {"README.md", "CODE_MAP.md", "THIRD_PARTY_NOTICES.txt"}
RESTRICTED = {"scripts/release_lock.py", "scripts/release_batch.py"}
CHECK = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:/-]{0,149}\Z")
HASH = re.compile(r"[a-f0-9]{64}\Z")
WINDOWS_DEVICE = re.compile(r"(?i)(con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:[ .].*)?\Z")


class BatchError(RuntimeError):
    pass


def _lock_module():
    # Locate the tool supplied with this checkout, never a path from a bundle.
    for parent in Path(__file__).absolute().parents:
        candidate = parent / "scripts" / "release_lock.py"
        if candidate.is_file():
            _plain(candidate)
            spec = importlib.util.spec_from_file_location("_hcv_release_lock", candidate)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module
    raise BatchError("Cannot find scripts/release_lock.py in this checkout")


def _plain(path):
    path = Path(os.path.abspath(path))
    for item in (path, *path.parents):
        try:
            info = item.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0):
            raise BatchError(f"Symbolic link or junction refused: {item}")
    return path


def _local_path(root, path):
    root = _plain(root)
    local = _plain(root / ".local")
    target = _plain(path)
    try:
        relative = target.relative_to(local)
    except ValueError:
        raise BatchError(f"Preparation and journals must be under {local}") from None
    if not relative.parts:
        raise BatchError("Use a unique path inside .local")
    return target


def _relative(value):
    if not isinstance(value, str) or not value or "\\" in value or value.startswith("/"):
        raise BatchError(f"Unsafe relative path: {value!r}")
    parts = value.split("/")
    for part in parts:
        if (not part or part in {".", ".."} or part[0].isspace() or part[-1] in " ."
                or WINDOWS_DEVICE.fullmatch(part) or PureWindowsPath(part).is_reserved()
                or any(ord(char) < 32 or char in ':*?"<>|' for char in part)):
            raise BatchError(f"Unsafe relative path: {value!r}")
    if not ((len(parts) >= 2 and parts[0] in ALLOWED) or (len(parts) == 1 and value in ROOT_FILES)):
        raise BatchError(f"Path is outside allowed project files: {value}")
    if value.casefold() in {entry.casefold() for entry in RESTRICTED}:
        raise BatchError(f"Coordination tool cannot update itself: {value}")
    return value


def _file_bytes(path, missing=False, *, allow_links=False):
    path = _plain(path)
    try:
        info = path.lstat()
    except FileNotFoundError:
        if missing:
            return None
        raise BatchError(f"Required file missing: {path}") from None
    if not stat.S_ISREG(info.st_mode):
        raise BatchError(f"Not a regular file: {path}")
    if info.st_nlink > 1 and not allow_links:
        raise BatchError(f"Hard-linked file refused: {path}")
    data = path.read_bytes()
    # Detect ordinary concurrent edits while reading. Cooperative ownership is
    # still required; this does not prevent non-cooperative external writers.
    after = path.lstat()
    if (info.st_size, info.st_mtime_ns, info.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
        raise BatchError(f"File changed while reading: {path}")
    return data


def _identity(path):
    """Fail closed when the filesystem does not provide stable file identity."""
    info = _plain(path).stat()
    if not info.st_dev or not info.st_ino:
        raise BatchError(f"Reliable file identity unavailable: {path}")
    return info.st_dev, info.st_ino


def _supports_safe_replacement():
    return os.name == "nt"


def _digest(value):
    return sha256(value).hexdigest()


def _encode(value):
    return None if value is None else base64.b64encode(value).decode("ascii")


def _decode(value, expected, *, missing=False):
    if value is None:
        if missing and expected is None:
            return None
        raise BatchError("Missing embedded bytes")
    try:
        result = base64.b64decode(value, validate=True)
    except (TypeError, ValueError):
        raise BatchError("Invalid embedded file bytes") from None
    if not isinstance(expected, str) or not HASH.fullmatch(expected) or _digest(result) != expected:
        raise BatchError("Embedded file hash does not match")
    try:
        text = result.decode("utf-8")
    except UnicodeDecodeError:
        raise BatchError("Only UTF-8 text files can be reviewed") from None
    if "\0" in text:
        raise BatchError("Binary files are not supported")
    return result


def _diff(files):
    result = []
    for record in files:
        before = record["before"] or b""
        after = record["after"]
        left = before.decode("utf-8").splitlines(keepends=True)
        right = after.decode("utf-8").splitlines(keepends=True)
        lines = difflib.unified_diff(
            left, right,
            fromfile=record["path"] if record["before"] is not None else "/dev/null",
            tofile=record["path"],
            lineterm="\n",
        )
        for line in lines:
            result.append(line)
            if line.startswith(("+", "-", " ")) and not line.endswith("\n"):
                result.append("\n\\ No newline at end of file\n")
    return "".join(result).encode("utf-8")


def _create_file(path, data):
    _plain(path)
    with path.open("xb") as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())


def _json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def _write_json(path, value):
    """Replace our own journal atomically, with its data flushed first."""
    path = _plain(path)
    temp = path.with_name(".hcv-journal-" + uuid4().hex + ".tmp")
    _create_file(temp, _json_bytes(value))
    os.replace(temp, path)


def _text(value, name):
    if not isinstance(value, str) or not value.strip() or len(value) > 300 or any(c in value for c in "\r\n"):
        raise BatchError(f"{name} must be a short single-line text")
    return value


def _checks(values):
    if not isinstance(values, list) or not values:
        raise BatchError("Provide at least one required scenario with --check")
    if any(not isinstance(item, str) or not CHECK.fullmatch(item) for item in values):
        raise BatchError("Invalid scenario name")
    return sorted(set(values))


def prepare(root, base, candidate, out, task, paths, checks):
    root = _plain(root)
    base = _local_path(root, base)
    candidate = _local_path(root, candidate)
    out = _local_path(root, out)
    _text(task, "Task")
    checks = _checks(checks)
    if not base.is_dir() or not candidate.is_dir():
        raise BatchError("Base and candidate must be existing directories under .local")
    if not paths:
        raise BatchError("Provide at least one --file")
    entries = []
    seen = set()
    for value in paths:
        name = _relative(value)
        if name.casefold() in seen:
            raise BatchError(f"Repeated file path: {name}")
        seen.add(name.casefold())
        before = _file_bytes(base.joinpath(*name.split("/")), missing=True)
        after = _file_bytes(candidate.joinpath(*name.split("/")))
        _decode(_encode(before), _digest(before) if before is not None else None, missing=True)
        _decode(_encode(after), _digest(after))
        if before == after:
            raise BatchError(f"File does not change: {name}")
        entries.append({"path": name, "before": before, "after": after})
    entries.sort(key=lambda entry: entry["path"].casefold())
    diff = _diff(entries)
    manifest = {
        "schema": SCHEMA,
        "task": task,
        "checks": checks,
        "diff_sha256": _digest(diff),
        "files": [{
            "path": item["path"],
            "before_sha256": None if item["before"] is None else _digest(item["before"]),
            "before_base64": _encode(item["before"]),
            "after_sha256": _digest(item["after"]),
            "after_base64": _encode(item["after"]),
        } for item in entries],
    }
    # Never overwrite another candidate or create arbitrary parent directories.
    if not out.parent.is_dir():
        raise BatchError(f"Create the parent of the unique bundle first: {out.parent}")
    out.mkdir(exist_ok=False)
    _create_file(out / "changes.diff", diff)
    raw = _json_bytes(manifest)
    _create_file(out / "bundle.json", raw)
    return {"bundle": str(out), "sha256": _digest(raw), "files": [e["path"] for e in entries], "checks": checks}


def _read_bundle(root, bundle, expected=None):
    bundle = _local_path(root, bundle)
    if not bundle.is_dir():
        raise BatchError(f"Bundle directory missing: {bundle}")
    raw = _file_bytes(bundle / "bundle.json")
    digest = _digest(raw)
    if expected is not None and (not HASH.fullmatch(expected) or digest != expected):
        raise BatchError(f"Bundle changed after review: {bundle}")
    try:
        value = json.loads(raw)
    except (ValueError, UnicodeError):
        raise BatchError(f"Unreadable bundle: {bundle}") from None
    if not isinstance(value, dict) or set(value) != {"schema", "task", "checks", "diff_sha256", "files"} or type(value["schema"]) is not int or value["schema"] != SCHEMA:
        raise BatchError("Unknown bundle format")
    _text(value["task"], "Task")
    checks = _checks(value["checks"])
    if checks != value["checks"]:
        raise BatchError("Bundle scenario list is not canonical")
    if not isinstance(value["files"], list) or not value["files"]:
        raise BatchError("Bundle contains no files")
    files = []
    seen = set()
    for item in value["files"]:
        if not isinstance(item, dict) or set(item) != {"path", "before_sha256", "before_base64", "after_sha256", "after_base64"}:
            raise BatchError("Invalid file record")
        path = _relative(item["path"])
        if path.casefold() in seen:
            raise BatchError(f"Repeated file in bundle: {path}")
        seen.add(path.casefold())
        before = _decode(item["before_base64"], item["before_sha256"], missing=True)
        after = _decode(item["after_base64"], item["after_sha256"])
        if before == after:
            raise BatchError(f"File does not change: {path}")
        files.append({"path": path, "before": before, "after": after})
    if [f["path"] for f in files] != sorted((f["path"] for f in files), key=str.casefold):
        raise BatchError("Bundle files are not canonical")
    diff = _file_bytes(bundle / "changes.diff")
    if (not isinstance(value["diff_sha256"], str) or not HASH.fullmatch(value["diff_sha256"])
            or _digest(diff) != value["diff_sha256"] or diff != _diff(files)):
        raise BatchError(f"Bundle diff is inconsistent: {bundle}")
    return {"bundle": str(bundle), "sha256": digest, "task": value["task"], "checks": checks, "files": files}


def inspect(root, bundles, expected=None):
    if not bundles:
        raise BatchError("Select at least one bundle")
    if expected is not None and len(expected) != len(bundles):
        raise BatchError("Provide one reviewed --sha256 per --bundle, in the same order")
    packages = [_read_bundle(root, path, None if expected is None else expected[index])
                for index, path in enumerate(bundles)]
    paths = {}
    checks = set()
    for package in packages:
        checks.update(package["checks"])
        for file in package["files"]:
            key = file["path"].casefold()
            if key in paths:
                raise BatchError(f"Bundles overlap on {file['path']}; prepare a combined candidate")
            paths[key] = package["bundle"]
    return packages, sorted(checks)


def summary(packages, checks):
    return {
        "bundles": [{
            "bundle": package["bundle"], "sha256": package["sha256"],
            "task": package["task"], "checks": package["checks"],
            "files": [item["path"] for item in package["files"]],
            "diff": str(Path(package["bundle"]) / "changes.diff"),
        } for package in packages],
        "checks_union": checks,
        "note": "The release owner must review diffs, other build inputs and coverage; tests are not run by this tool.",
    }


def _verify_targets(root, entries, complete, transaction=None, records=None):
    for index, item in enumerate(entries):
        path = _plain(root.joinpath(*item["path"].split("/")))
        if not path.parent.is_dir():
            raise BatchError(f"Parent folder missing; create it explicitly first: {path.parent}")
        actual = _file_bytes(path, missing=True, allow_links=records is not None)
        expected = item["after"] if index in complete else item["before"]
        if actual != expected:
            raise BatchError(f"Workspace file changed, no further files written: {item['path']}")
        if records is None or item["before"] is None:
            continue
        saved = _plain(transaction / records[index]["before_full"])
        original_identity = tuple(records[index]["original_identity"])
        if _identity(saved) != original_identity or _file_bytes(saved, allow_links=True) != item["before"]:
            raise BatchError(f"Complete backup changed: {item['path']}")
        target_identity = _identity(path)
        if index not in complete:
            if target_identity != original_identity or path.stat().st_nlink != 2 or saved.stat().st_nlink != 2:
                raise BatchError(f"Original and backup link differ: {item['path']}")
        elif target_identity == original_identity or saved.stat().st_nlink != 1:
            raise BatchError(f"Replacement or full backup identity is unexpected: {item['path']}")


def _replace_target(path, content, existed, pending):
    _plain(path)
    _plain(pending)
    if not path.parent.is_dir():
        raise BatchError(f"Parent folder missing; create it explicitly first: {path.parent}")
    _create_file(pending, content)
    if existed:
        # ReplaceFileW with flags=0 retains the replaced file's security
        # descriptor and alternate streams, or reports failure.  Its failure
        # modes can move files: the journal records both paths, with no retry
        # or automatic rollback.
        import ctypes
        from ctypes import wintypes
        replace = ctypes.WinDLL("kernel32", use_last_error=True).ReplaceFileW
        replace.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.LPCWSTR,
                            wintypes.DWORD, wintypes.LPVOID, wintypes.LPVOID]
        replace.restype = wintypes.BOOL
        if not replace(str(path), str(pending), None, 0, None, None):
            raise ctypes.WinError(ctypes.get_last_error())
    else:
        # link() is atomic and fails if a previously absent path appears.
        os.link(pending, path)
        pending.unlink()


def apply(root, bundles, expected, transaction, owner):
    root = _plain(root)
    transaction = _local_path(root, transaction)
    lock = _lock_module()
    lock.require_owner(root, owner)
    if not _supports_safe_replacement():
        raise BatchError("Apply is unavailable on this platform: file metadata preservation is unverified")
    packages, checks = inspect(root, bundles, expected)
    entries = [item for package in packages for item in package["files"]]
    if not transaction.parent.is_dir():
        raise BatchError(f"Create the journal parent first: {transaction.parent}")
    _verify_targets(root, entries, set())
    transaction.mkdir(exist_ok=False)
    (transaction / "before").mkdir()
    (transaction / "before_full").mkdir()
    (transaction / "after").mkdir()
    records = []
    for index, item in enumerate(entries):
        name = f"{index:04d}.bin"
        if item["before"] is not None:
            _create_file(transaction / "before" / name, item["before"])
        _create_file(transaction / "after" / name, item["after"])
        records.append({
            "path": item["path"], "before": None if item["before"] is None else "before/" + name,
            "before_sha256": None if item["before"] is None else _digest(item["before"]),
            "before_full": None if item["before"] is None else "before_full/" + name,
            "original_identity": None if item["before"] is None else list(_identity(root.joinpath(*item["path"].split("/")))),
            "backup_linked": False,
            "after": "after/" + name, "after_sha256": _digest(item["after"]),
            "applied": False,
        })
    journal = {
        "schema": SCHEMA, "owner": owner, "created_utc": datetime.now(timezone.utc).isoformat(),
        "status": "preparing", "in_progress": None, "pending_path": None,
        "bundles": [{"path": p["bundle"], "sha256": p["sha256"]} for p in packages],
        "checks_union": checks, "files": records,
    }
    _create_file(transaction / "journal.json", _json_bytes(journal))
    complete = set()
    try:
        # Link every original before replacing any file.  The hard link retains
        # every NTFS stream and security descriptor, not only the default bytes.
        # Until replacement it shares the inode: a non-cooperating in-place
        # writer can still alter both links.  We recheck bytes and identity
        # before every operation; this is not an OS-wide write lock.
        for index, item in enumerate(entries):
            lock.require_owner(root, owner)
            name = f"{index:04d}.bin"
            if item["before"] is not None:
                target = _plain(root.joinpath(*item["path"].split("/")))
                saved = _plain(transaction / records[index]["before_full"])
                if (_identity(target) != tuple(records[index]["original_identity"])
                        or _file_bytes(target) != item["before"]):
                    raise BatchError(f"Original changed before full backup: {item['path']}")
                os.link(target, saved)
                if (_identity(saved) != tuple(records[index]["original_identity"])
                        or _identity(target) != _identity(saved)
                        or target.stat().st_nlink != 2 or saved.stat().st_nlink != 2
                        or _file_bytes(saved, allow_links=True) != item["before"]):
                    raise BatchError(f"Cannot verify full backup identity: {item['path']}")
                journal["files"][index]["backup_linked"] = True
                _write_json(transaction / "journal.json", journal)
            if _file_bytes(transaction / "after" / name) != item["after"]:
                raise BatchError("Cannot verify saved new bytes")
            if item["before"] is not None and _file_bytes(transaction / "before" / name) != item["before"]:
                raise BatchError("Cannot verify saved original bytes")
        _verify_targets(root, entries, complete, transaction, records)
        journal["status"] = "prepared"
        _write_json(transaction / "journal.json", journal)
        if json.loads(_file_bytes(transaction / "journal.json")) != journal:
            raise BatchError("Cannot verify prepared journal")
        journal["status"] = "applying"
        _write_json(transaction / "journal.json", journal)
        for index, item in enumerate(entries):
            lock.require_owner(root, owner)
            _verify_targets(root, entries, complete, transaction, records)
            target = root.joinpath(*item["path"].split("/"))
            pending = target.with_name(".hcv-batch-" + uuid4().hex + ".tmp")
            journal["in_progress"] = item["path"]
            journal["pending_path"] = str(pending)
            _write_json(transaction / "journal.json", journal)
            # Check ownership and all preimages again after journaling.
            lock.require_owner(root, owner)
            _verify_targets(root, entries, complete, transaction, records)
            _replace_target(target, item["after"], item["before"] is not None, pending)
            complete.add(index)
            journal["files"][index]["applied"] = True
            journal["in_progress"] = None
            journal["pending_path"] = None
            _write_json(transaction / "journal.json", journal)
        lock.require_owner(root, owner)
        _verify_targets(root, entries, complete, transaction, records)
        journal["status"] = "applied"
        _write_json(transaction / "journal.json", journal)
    except BaseException as error:
        journal["status"] = "interrupted"
        journal["error"] = f"{type(error).__name__}: {error}"
        try:
            _write_json(transaction / "journal.json", journal)
        except (OSError, BatchError):
            pass
        raise
    return {"journal": str(transaction / "journal.json"), "status": "applied",
            "checks_union": checks, "note": "Changes are not a verified release. Run all required checks on the final ZIP."}


def main(argv=None):
    parser = ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    def common(p):
        p.add_argument("--root", type=Path, default=Path(__file__).absolute().parent.parent)
    create = sub.add_parser("prepare", help="Create one unique review bundle from .local snapshots")
    common(create)
    create.add_argument("--base", required=True, type=Path)
    create.add_argument("--candidate", required=True, type=Path)
    create.add_argument("--out", required=True, type=Path)
    create.add_argument("--task", required=True)
    create.add_argument("--file", action="append", required=True, dest="files")
    create.add_argument("--check", action="append", required=True, dest="checks")
    review = sub.add_parser("review", help="Validate selected bundles and report the union of scenarios")
    common(review)
    review.add_argument("--bundle", action="append", required=True, type=Path, dest="bundles")
    install = sub.add_parser("apply", help="Apply reviewed, non-overlapping bundles under release ownership")
    common(install)
    install.add_argument("--bundle", action="append", required=True, type=Path, dest="bundles")
    install.add_argument("--sha256", action="append", required=True, dest="hashes")
    install.add_argument("--transaction", required=True, type=Path)
    install.add_argument("--owner", default=os.environ.get("HCV_RELEASE_OWNER", ""))
    args = parser.parse_args(argv)
    try:
        if args.command == "prepare":
            result = prepare(args.root, args.base, args.candidate, args.out, args.task, args.files, args.checks)
        elif args.command == "review":
            result = summary(*inspect(args.root, args.bundles))
        else:
            result = apply(args.root, args.bundles, args.hashes, args.transaction, args.owner)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (BatchError, OSError, ValueError) as error:
        print(f"Batch stopped: {error}", file=sys.stderr)
        return 2
    except Exception as error:
        # OwnershipError is defined by the trusted dynamically loaded module.
        print(f"Batch stopped: {type(error).__name__}: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    raise SystemExit(main())
