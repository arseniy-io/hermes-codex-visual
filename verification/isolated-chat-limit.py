"""Install the conversation limit in disposable Hermes test profiles."""

import os
import sqlite3
import stat
import sys
from contextlib import closing
from pathlib import Path


MESSAGE_LIMIT = 10
CHAT_MESSAGES = "hcv_test_chat_messages"


def assert_plain_path(path):
    info = path.lstat()
    attributes = getattr(info, "st_file_attributes", 0)
    if path.is_symlink() or attributes & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0):
        raise ValueError(f"Test path is a link: {path}")


def install_limit(database):
    with closing(sqlite3.connect(database.as_uri() + "?mode=rw", uri=True)) as conn, conn:
        conn.execute(f"""
            CREATE VIEW IF NOT EXISTS {CHAT_MESSAGES} AS
            SELECT id, session_id
            FROM messages
            WHERE (active = 1 OR compacted = 1)
              AND (role = 'user' OR (role = 'assistant' AND length(content) > 0))
              AND coalesce(display_kind, '') NOT IN ('hidden', 'async_delegation_complete')
              AND CASE WHEN json_valid(display_metadata)
                       THEN coalesce(json_extract(display_metadata, '$.model_only'), 0) = 0
                       ELSE 1 END
        """)
        overflow = conn.execute(f"""
            SELECT session_id, count(*) FROM {CHAT_MESSAGES}
            GROUP BY session_id HAVING count(*) > ?
        """, (MESSAGE_LIMIT,)).fetchone()
        if overflow:
            raise ValueError(f"Test chat {overflow[0]} has {overflow[1]} messages, limit {MESSAGE_LIMIT}")
        # Enforce inside SQLite so batch writes and independent gateway writers
        # share the same limit. An aborted write leaves no eleventh message.
        for name, event in [
            ("insert", "INSERT"),
            ("update", "UPDATE OF session_id, role, content, active, compacted, display_kind, display_metadata"),
        ]:
            conn.execute(f"""
                CREATE TRIGGER IF NOT EXISTS hcv_test_chat_limit_{name}
                AFTER {event} ON messages
                WHEN EXISTS (SELECT 1 FROM {CHAT_MESSAGES} WHERE id = NEW.id)
                 AND (SELECT count(*) FROM {CHAT_MESSAGES} WHERE session_id = NEW.session_id) > {MESSAGE_LIMIT}
                BEGIN
                    SELECT RAISE(ABORT, 'Test chat reached {MESSAGE_LIMIT} messages. Start a new chat.');
                END
            """)


def prepare(root):
    from hermes_state import SessionDB

    root = root.absolute()
    assert_plain_path(root)
    if root.parent != Path(os.environ["HERMES_VISUAL_TEST_TEMP"]).resolve() or not root.name.startswith(
        "hermes-e2e-codex-visual-"
    ):
        raise ValueError("Chat limit setup requires a disposable visual-test directory")
    homes = [root / "hermes-home"]
    if (root / "remote-profile").exists():
        homes.append(root / "remote-profile")
    for home in homes[:]:
        assert_plain_path(home)
        profiles = home / "profiles"
        if profiles.exists():
            assert_plain_path(profiles)
            homes.extend(folder for folder in profiles.iterdir() if folder.is_dir())
    for home in homes:
        assert_plain_path(home)
        database = home / "state.db"
        if not database.exists():
            with closing(SessionDB(db_path=database)):
                pass
        for filename in ("state.db", "state.db-wal", "state.db-shm"):
            candidate = home / filename
            if candidate.exists() or candidate.is_symlink():
                assert_plain_path(candidate)
        install_limit(database)
    print(f"Test chat limit: {MESSAGE_LIMIT} messages in {len(homes)} isolated profile(s)")


if __name__ == "__main__":
    prepare(Path(sys.argv[1]))
