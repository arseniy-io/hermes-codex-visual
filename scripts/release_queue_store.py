"""Durable release queue. Callers verify files, build evidence and live Hermes.

Ready details carry archive_sha256 and version. A successful install receipt
carries intent_id, archive_sha256, version, new_base_id and verified=True.
The installer sets verified only after checking the applied and loaded release.
Extra JSON fields are retained. Cancel requires the caller to guard its write
journal and serialize against starting external installation work.
"""

from contextlib import closing, contextmanager
from hashlib import sha256
import json
import os
from pathlib import Path, PureWindowsPath
import re
import sqlite3
import stat
from uuid import uuid4


class QueueError(RuntimeError):
    """Invalid input, conflicting queue state, or an unavailable database."""


_APPLICATION_ID = 0x48435651
_SCHEMA_VERSION = 1
_HASH = re.compile(r"[0-9a-f]{64}")
_IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")
_NUMBER = r"(?:0|[1-9][0-9]*)"
_VERSION = re.compile(rf"{_NUMBER}\.{_NUMBER}\.{_NUMBER}")

_SCHEMA = (
    """CREATE TABLE bases (
        id TEXT PRIMARY KEY NOT NULL,
        generation INTEGER NOT NULL UNIQUE,
        document TEXT NOT NULL
    )""",
    """CREATE TABLE current_base (
        slot INTEGER PRIMARY KEY CHECK (slot = 1),
        base_id TEXT NOT NULL REFERENCES bases(id)
    )""",
    """CREATE TABLE tasks (
        task_id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        base_id TEXT NOT NULL REFERENCES bases(id)
    )""",
    """CREATE TABLE revisions (
        task_id TEXT NOT NULL REFERENCES tasks(task_id),
        revision INTEGER NOT NULL CHECK (revision > 0),
        base_id TEXT NOT NULL REFERENCES bases(id),
        digest TEXT NOT NULL,
        payload TEXT NOT NULL,
        checks TEXT NOT NULL,
        installed_base_id TEXT REFERENCES bases(id),
        PRIMARY KEY (task_id, revision)
    )""",
    """CREATE TABLE intents (
        id TEXT PRIMARY KEY NOT NULL,
        base_id TEXT NOT NULL REFERENCES bases(id),
        selection_key TEXT NOT NULL,
        refs TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('pending', 'cancelled', 'installed')),
        new_base_id TEXT REFERENCES bases(id),
        receipt TEXT
    )""",
    "CREATE UNIQUE INDEX one_pending_intent ON intents(state) WHERE state = 'pending'",
    """CREATE TABLE candidates (
        key TEXT PRIMARY KEY NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('ready', 'blocked')),
        details TEXT NOT NULL
    )""",
)

_TASK_PROGRESS = """
    SELECT task_id, title, base_id,
        (SELECT max(revision) FROM revisions WHERE task_id = tasks.task_id) AS latest_revision,
        (SELECT max(revision) FROM revisions
            WHERE task_id = tasks.task_id AND installed_base_id IS NOT NULL) AS installed_revision
    FROM tasks ORDER BY task_id
"""


def _checked_file(path, *, directory=False):
    try:
        info = path.lstat()
    except FileNotFoundError:
        return
    except OSError as error:
        raise QueueError(f"Cannot inspect queue path {path}: {error}") from error
    reparse = getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT
    if reparse or stat.S_ISLNK(info.st_mode):
        raise QueueError(f"Link or reparse point refused: {path}")
    if directory and not stat.S_ISDIR(info.st_mode):
        raise QueueError(f"Queue parent is not a directory: {path}")
    if not directory and (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1):
        raise QueueError(f"Queue file must be a regular, singly linked file: {path}")


def _check_path(path):
    for parent in reversed(path.parents):
        _checked_file(parent, directory=True)
    _checked_file(path)
    for suffix in ("-journal", "-wal", "-shm"):
        _checked_file(path.with_name(path.name + suffix))


def _database_path(path):
    try:
        path = Path(path)
    except TypeError as error:
        raise QueueError("Queue path must be a filesystem path") from error
    if not path.name or ".." in path.parts or "\0" in str(path):
        raise QueueError("Queue path must name a database file without parent traversal")
    if os.name == "nt":
        if path.anchor and not re.fullmatch(r"[A-Za-z]:\\", path.anchor):
            raise QueueError("Queue path must use a local drive")
        components = path.parts[1:] if path.anchor else path.parts
        for part in components:
            if (PureWindowsPath(part).is_reserved() or part.endswith((".", " "))
                    or any(ord(char) < 32 or char in ':*?"<>|' for char in part)):
                raise QueueError(f"Unsafe Windows queue path component: {part!r}")
    path = path.absolute()
    if os.name == "nt":
        import ctypes

        kernel = ctypes.windll.kernel32
        root = ctypes.c_wchar_p(path.anchor)
        filesystem = ctypes.create_unicode_buffer(32)
        if (kernel.GetDriveTypeW(root) != 3 or not kernel.GetVolumeInformationW(
                root, None, 0, None, None, None, filesystem, len(filesystem))
                or filesystem.value != "NTFS"):
            raise QueueError("Queue database requires a local fixed NTFS drive")
    _check_path(path)
    return path


def _json(value):
    try:
        encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)
        if json.loads(encoded) != value:
            raise ValueError("JSON needs string keys and lists")
    except (TypeError, ValueError, RecursionError) as error:
        raise QueueError(f"Value is not JSON-compatible: {error}") from error
    return encoded


def _identifier(value, label):
    if not isinstance(value, str) or not _IDENTIFIER.fullmatch(value):
        raise QueueError(f"Invalid {label}")


def _hash(value, label):
    if not isinstance(value, str) or not _HASH.fullmatch(value):
        raise QueueError(f"{label} must be a lowercase SHA-256")


def _version(value):
    if not isinstance(value, str) or not _VERSION.fullmatch(value):
        raise QueueError("Version must be x.y.z")
    return tuple((len(part), part) for part in value.split("."))


def _base_json(base):
    if not isinstance(base, dict):
        raise QueueError("Base must be an object")
    _hash(base.get("id"), "Base ID")
    _version(base.get("version"))
    return _json(base)


def _revision_number(revision):
    if type(revision) is not int or not 1 <= revision < 2**63:
        raise QueueError("Revision must be a positive SQLite integer")


def _submission_json(payload, checks):
    if not isinstance(payload, dict) or not isinstance(payload.get("files"), list):
        raise QueueError("Payload must have a files list")
    for entry in payload["files"]:
        if not isinstance(entry, dict) or not isinstance(entry.get("path"), str):
            raise QueueError("Payload file must have a string path")
        for field in ("before", "after"):
            if field not in entry or (entry[field] is not None and not isinstance(entry[field], str)):
                raise QueueError(f"Payload file {field} must be a string or null")
    if not isinstance(checks, list) or any(not isinstance(check, str) for check in checks):
        raise QueueError("Checks must be a list of strings")
    return _json(payload), _json(checks)


def _identity(item):
    return [item["task_id"], item["revision"], item["base_id"], item["digest"]]


def _selection_key(base, items):
    identities = []
    for item in items:
        previous = item["installed_revision"]
        identities.append([_identity(item), None if previous is None else _identity(previous)])
    return sha256(_json({"base": base, "items": identities}).encode("ascii")).hexdigest()


def _record(row):
    return {
        "task_id": row["task_id"], "title": row["title"], "revision": row["revision"],
        "base_id": row["base_id"], "digest": row["digest"],
        "payload": json.loads(row["payload"]), "checks": json.loads(row["checks"]),
    }


class QueueStore:
    def __init__(self, path: Path):
        self.path = _database_path(path)
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
        except OSError as error:
            raise QueueError(f"Cannot make queue directory: {error}") from error
        with self._transaction(write=True, create=True) as db:
            application = db.execute("PRAGMA application_id").fetchone()[0]
            schema = db.execute("PRAGMA user_version").fetchone()[0]
            if (application, schema) == (_APPLICATION_ID, _SCHEMA_VERSION):
                return
            if application or schema or db.execute("SELECT 1 FROM sqlite_master LIMIT 1").fetchone():
                raise QueueError("Database is not a supported release queue")
            for statement in _SCHEMA:
                db.execute(statement)
            db.execute(f"PRAGMA application_id = {_APPLICATION_ID}")
            db.execute(f"PRAGMA user_version = {_SCHEMA_VERSION}")

    @contextmanager
    def _transaction(self, *, write=False, create=False):
        _check_path(self.path)
        mode = "rwc" if create else "rw"
        try:
            uri = self.path.as_uri() + f"?mode={mode}"
            with closing(sqlite3.connect(uri, uri=True, timeout=10, isolation_level=None)) as db:
                db.row_factory = sqlite3.Row
                db.execute("PRAGMA foreign_keys = ON")
                db.execute("PRAGMA synchronous = FULL")
                db.execute("BEGIN IMMEDIATE" if write else "BEGIN")
                try:
                    yield db
                    db.commit()
                except BaseException:
                    db.rollback()
                    raise
        except sqlite3.Error as error:
            raise QueueError(f"Release queue database error: {error}") from error

    def _current(self, db):
        return db.execute("SELECT b.* FROM current_base c JOIN bases b ON b.id = c.base_id").fetchone()

    def set_base(self, base: dict) -> dict:
        document = _base_json(base)
        approved = json.loads(document)
        base_id = approved["id"]
        with self._transaction(write=True) as db:
            current = self._current(db)
            if current is None:
                db.execute("INSERT INTO bases VALUES (?, 1, ?)", (base_id, document))
                db.execute("INSERT INTO current_base VALUES (1, ?)", (base_id,))
            elif current["document"] != document:
                raise QueueError("An approved base already exists")
            return approved

    def current_base(self) -> dict | None:
        with self._transaction() as db:
            row = self._current(db)
            return None if row is None else json.loads(row["document"])

    def register_task(self, task_id: str, title: str, base_id: str) -> dict:
        _identifier(task_id, "task ID")
        _hash(base_id, "Base ID")
        if not isinstance(title, str) or not title.strip() or not title.isprintable():
            raise QueueError("Title must be printable single-line text")
        with self._transaction(write=True) as db:
            task = db.execute("SELECT * FROM tasks WHERE task_id = ?", (task_id,)).fetchone()
            if task is not None:
                return dict(task)
            current = self._current(db)
            if current is None or current["id"] != base_id:
                raise QueueError("New tasks must start from the current approved base")
            db.execute("INSERT INTO tasks VALUES (?, ?, ?)", (task_id, title, base_id))
            return {"task_id": task_id, "title": title, "base_id": base_id}

    def task(self, task_id: str) -> dict | None:
        _identifier(task_id, "task ID")
        with self._transaction() as db:
            task = db.execute("SELECT * FROM tasks WHERE task_id = ?", (task_id,)).fetchone()
            return None if task is None else dict(task)

    def _revision(self, db, task_id, revision):
        return db.execute(
            """SELECT r.*, t.title FROM revisions r JOIN tasks t USING (task_id)
               WHERE r.task_id = ? AND r.revision = ?""", (task_id, revision)
        ).fetchone()

    def submit(self, task_id: str, revision: int, base_id: str, digest: str,
               payload: dict, checks: list[str]) -> dict:
        _identifier(task_id, "task ID")
        _revision_number(revision)
        _hash(base_id, "Base ID")
        _hash(digest, "Submission digest")
        payload_json, checks_json = _submission_json(payload, checks)
        fields = (base_id, digest, payload_json, checks_json)
        with self._transaction(write=True) as db:
            existing = self._revision(db, task_id, revision)
            if existing is not None:
                stored = tuple(existing[key] for key in ("base_id", "digest", "payload", "checks"))
                if stored != fields:
                    raise QueueError("Submission conflicts with an immutable revision")
                return _record(existing)
            task = db.execute("SELECT 1 FROM tasks WHERE task_id = ?", (task_id,)).fetchone()
            if task is None:
                raise QueueError("Task must be registered before submitting")
            if db.execute("SELECT 1 FROM bases WHERE id = ?", (base_id,)).fetchone() is None:
                raise QueueError("Submission base is unknown")
            latest = db.execute("SELECT max(revision) FROM revisions WHERE task_id = ?", (task_id,)).fetchone()[0]
            expected = (latest or 0) + 1
            if revision != expected:
                raise QueueError(f"Expected revision {expected} for {task_id}")
            db.execute("INSERT INTO revisions VALUES (?, ?, ?, ?, ?, ?, NULL)", (task_id, revision, *fields))
            return _record(self._revision(db, task_id, revision))

    def _item(self, db, task_id, revision, installed_revision):
        row = self._revision(db, task_id, revision)
        if row is None:
            raise QueueError("Selection references an unknown revision")
        item = _record(row)
        item["installed_revision"] = None
        if installed_revision is not None:
            previous = self._revision(db, task_id, installed_revision)
            if previous is None or previous["installed_base_id"] is None:
                raise QueueError("Selection references an unknown installed predecessor")
            item["installed_revision"] = _record(previous)
        return item

    def _selection(self, db):
        row = self._current(db)
        base = None if row is None else json.loads(row["document"])
        items = []
        for task in db.execute(_TASK_PROGRESS):
            latest = task["latest_revision"]
            installed = task["installed_revision"]
            if latest is not None and latest > (installed or 0):
                items.append(self._item(db, task["task_id"], latest, installed))
        return {"base": base, "key": _selection_key(base, items), "items": items}

    def selection(self) -> dict:
        with self._transaction() as db:
            return self._selection(db)

    def _pending(self, db):
        return db.execute("SELECT * FROM intents WHERE state = 'pending'").fetchone()

    def _intent(self, db, intent_id):
        return db.execute("SELECT * FROM intents WHERE id = ?", (intent_id,)).fetchone()

    def _frozen(self, db, intent):
        base = db.execute("SELECT document FROM bases WHERE id = ?", (intent["base_id"],)).fetchone()
        items = [self._item(db, *ref) for ref in json.loads(intent["refs"])]
        return {"id": intent["id"], "selection": {
            "base": json.loads(base["document"]), "key": intent["selection_key"], "items": items,
        }}

    def freeze(self) -> dict | None:
        with self._transaction(write=True) as db:
            pending = self._pending(db)
            if pending is not None:
                return self._frozen(db, pending)
            selection = self._selection(db)
            if not selection["items"]:
                return None
            # Both references are fixed at the cutoff; the revision bodies are immutable.
            refs = []
            for item in selection["items"]:
                previous = item["installed_revision"]
                previous_revision = None if previous is None else previous["revision"]
                refs.append([item["task_id"], item["revision"], previous_revision])
            intent_id = uuid4().hex
            db.execute("INSERT INTO intents VALUES (?, ?, ?, ?, 'pending', NULL, NULL)",
                       (intent_id, selection["base"]["id"], selection["key"], _json(refs)))
            return {"id": intent_id, "selection": selection}

    def pending_install(self) -> dict | None:
        with self._transaction() as db:
            pending = self._pending(db)
            return None if pending is None else self._frozen(db, pending)

    def cancel(self, intent_id: str) -> dict:
        """Close a request after the caller excludes an ongoing external install."""
        _identifier(intent_id, "intent ID")
        with self._transaction(write=True) as db:
            intent = self._intent(db, intent_id)
            if intent is None or intent["state"] == "installed":
                raise QueueError("Only an open or already cancelled request can be cancelled")
            if intent["state"] == "pending":
                db.execute("UPDATE intents SET state = 'cancelled' WHERE id = ?", (intent_id,))
            return {"id": intent_id, "state": "cancelled"}

    def _candidate(self, db, key):
        row = db.execute("SELECT * FROM candidates WHERE key = ?", (key,)).fetchone()
        if row is None:
            return None
        return {"key": key, "state": row["state"], "details": json.loads(row["details"])}

    def _validate_selection(self, db, base, key, items):
        known = db.execute("SELECT * FROM bases WHERE id = ?", (base["id"],)).fetchone()
        if known is None or known["document"] != _base_json(base):
            raise QueueError("Candidate base does not match an approved base record")
        previous_task_id = ""
        verified_items = []
        for item in items:
            if not isinstance(item, dict):
                raise QueueError("Candidate item must be an object")
            task_id, revision = item.get("task_id"), item.get("revision")
            _identifier(task_id, "task ID")
            _revision_number(revision)
            if task_id <= previous_task_id:
                raise QueueError("Candidate items must have distinct task IDs in queue order")
            previous_task_id = task_id
            # Historical candidates use the installed predecessor at their own base.
            previous = db.execute(
                """SELECT max(r.revision) FROM revisions r JOIN bases b ON b.id = r.installed_base_id
                   WHERE r.task_id = ? AND b.generation <= ?""", (task_id, known["generation"])
            ).fetchone()[0]
            expected = self._item(db, task_id, revision, previous)
            if revision <= (previous or 0) or _json(item) != _json(expected):
                raise QueueError("Candidate item does not match the exact queued revision and installed predecessor")
            verified_items.append(expected)
        if key != _selection_key(base, verified_items):
            raise QueueError("Candidate selection key does not match its exact contents")

    def save_candidate(self, selection: dict, state: str, details: dict) -> dict:
        if not isinstance(selection, dict) or set(selection) != {"base", "key", "items"}:
            raise QueueError("Candidate must refer to a queue selection")
        base, key, items = selection["base"], selection["key"], selection["items"]
        _base_json(base)
        _hash(key, "Candidate key")
        if not isinstance(items, list) or not items:
            raise QueueError("A candidate needs at least one selected revision")
        if state not in ("ready", "blocked") or not isinstance(details, dict):
            raise QueueError("Candidate needs a ready or blocked state and details object")
        document = _json(details)
        details = json.loads(document)
        if state == "ready":
            _hash(details.get("archive_sha256"), "Candidate archive SHA-256")
            if _version(details.get("version")) <= _version(base["version"]):
                raise QueueError("Candidate version must be newer than its base")
        with self._transaction(write=True) as db:
            self._validate_selection(db, base, key, items)
            existing = self._candidate(db, key)
            if existing is not None and existing["state"] == "ready":
                if state == "blocked" or existing["details"] == details:
                    return existing
                raise QueueError("Ready candidate must be retired before replacing its proof")
            db.execute("""INSERT INTO candidates VALUES (?, ?, ?)
                          ON CONFLICT (key) DO UPDATE SET state = excluded.state, details = excluded.details""",
                       (key, state, document))
            return {"key": key, "state": state, "details": details}

    def requeue_candidate(self, selection, previous, reason, build_request):
        key = selection["key"]
        details = {"reason": reason, "build_request": build_request, "retry_pending": True}
        document = _json(details)
        with self._transaction(write=True) as db:
            self._validate_selection(db, selection["base"], key, selection["items"])
            if self._candidate(db, key) != previous:
                raise QueueError("Candidate changed while scheduling its checks")
            db.execute("""INSERT INTO candidates VALUES (?, 'blocked', ?)
                          ON CONFLICT (key) DO UPDATE SET state = 'blocked', details = excluded.details""",
                       (key, document))
        return {"key": key, "state": "blocked", "details": details}

    def candidate(self, key: str) -> dict | None:
        _hash(key, "Candidate key")
        with self._transaction() as db:
            return self._candidate(db, key)

    def _installed(self, db, intent):
        base = db.execute("SELECT document FROM bases WHERE id = ?", (intent["new_base_id"],)).fetchone()
        return {**self._frozen(db, intent), "candidate_key": intent["selection_key"],
                "new_base": json.loads(base["document"]), "receipt": json.loads(intent["receipt"])}

    def complete_install(self, intent_id: str, candidate_key: str, new_base: dict, receipt: dict) -> dict:
        _identifier(intent_id, "intent ID")
        _hash(candidate_key, "Candidate key")
        base_json = _base_json(new_base)
        new_base = json.loads(base_json)
        receipt_json = _json(receipt)
        receipt = json.loads(receipt_json)
        if not isinstance(receipt, dict) or receipt.get("verified") is not True:
            raise QueueError("Install requires a verified installer receipt")
        _hash(receipt.get("archive_sha256"), "Installed archive SHA-256")
        if (receipt.get("intent_id") != intent_id or receipt.get("version") != new_base["version"]
                or receipt.get("new_base_id") != new_base["id"]):
            raise QueueError("Install receipt does not match the intent, version or new base")
        with self._transaction(write=True) as db:
            intent = self._intent(db, intent_id)
            if intent is None or intent["selection_key"] != candidate_key:
                raise QueueError("Candidate does not match the frozen install request")
            if intent["state"] == "installed":
                result = self._installed(db, intent)
                if _json(result["new_base"]) != base_json or intent["receipt"] != receipt_json:
                    raise QueueError("Completion conflicts with an already installed request")
                return result
            if intent["state"] != "pending":
                raise QueueError("Install request is no longer open")
            current = self._current(db)
            if current is None or current["id"] != intent["base_id"]:
                raise QueueError("Current base does not match the frozen install request")
            candidate = self._candidate(db, candidate_key)
            if candidate is None or candidate["state"] != "ready":
                raise QueueError("Frozen install request has no ready candidate")
            details = candidate["details"]
            if (details["archive_sha256"] != receipt["archive_sha256"]
                    or details["version"] != new_base["version"]):
                raise QueueError("Installed archive or version does not match the ready candidate")
            if db.execute("SELECT 1 FROM bases WHERE id = ?", (new_base["id"],)).fetchone() is not None:
                raise QueueError("A new release must have a new base ID")
            db.execute("INSERT INTO bases VALUES (?, ?, ?)",
                       (new_base["id"], current["generation"] + 1, base_json))
            for task_id, revision, _ in json.loads(intent["refs"]):
                changed = db.execute("""UPDATE revisions SET installed_base_id = ?
                                        WHERE task_id = ? AND revision = ? AND installed_base_id IS NULL""",
                                     (new_base["id"], task_id, revision))
                if changed.rowcount != 1:
                    raise QueueError("Frozen revision was already installed or is missing")
            db.execute("UPDATE current_base SET base_id = ? WHERE slot = 1", (new_base["id"],))
            db.execute("UPDATE intents SET state = 'installed', new_base_id = ?, receipt = ? WHERE id = ?",
                       (new_base["id"], receipt_json, intent_id))
            return self._installed(db, self._intent(db, intent_id))

    def installed(self, intent_id: str) -> dict | None:
        _identifier(intent_id, "intent ID")
        with self._transaction() as db:
            intent = self._intent(db, intent_id)
            if intent is None or intent["state"] != "installed":
                return None
            return self._installed(db, intent)

    def status(self) -> dict:
        """Return task progress and candidate states without payloads or receipts."""
        with self._transaction() as db:
            selection = self._selection(db)
            base = selection["base"]
            pending = self._pending(db)
            pending_status = None
            if pending is not None:
                item_count = len(json.loads(pending["refs"]))
                pending_status = self._status_selection(db, pending["selection_key"], item_count)
                pending_status["id"] = pending["id"]
            return {
                "base": None if base is None else {"id": base["id"], "version": base["version"]},
                "tasks": [dict(task) for task in db.execute(_TASK_PROGRESS)],
                "selection": self._status_selection(db, selection["key"], len(selection["items"])),
                "pending_install": pending_status,
            }

    def _status_selection(self, db, key, count):
        row = db.execute("SELECT state FROM candidates WHERE key = ?", (key,)).fetchone()
        return {"key": key, "count": count, "candidate_state": None if row is None else row["state"]}
