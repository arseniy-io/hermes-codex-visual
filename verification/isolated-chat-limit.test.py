import runpy
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path


install_limit = runpy.run_path(Path(__file__).with_name("isolated-chat-limit.py"))["install_limit"]
ADD = "INSERT INTO messages (session_id, role, content, display_kind) VALUES (?, ?, ?, ?)"


class IsolatedChatLimitTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.database = Path(temporary.name) / "state.db"
        with closing(sqlite3.connect(self.database)) as conn:
            conn.execute("""
                CREATE TABLE messages (
                    id INTEGER PRIMARY KEY, session_id TEXT, role TEXT, content TEXT,
                    active INTEGER DEFAULT 1, compacted INTEGER DEFAULT 0,
                    display_kind TEXT, display_metadata TEXT
                )
            """)

    def test_ten_messages_are_saved_and_a_separate_writer_cannot_add_an_eleventh(self):
        install_limit(self.database)
        with closing(sqlite3.connect(self.database)) as conn, conn:
            conn.executemany(ADD, [("one", role, "visible", None) for role in ("user", "assistant")] * 5)
            conn.execute(ADD, ("one", "tool", "result", None))
            conn.execute(ADD, ("one", "assistant", None, None))
            conn.execute(ADD, ("one", "user", "hidden", "hidden"))
        with closing(sqlite3.connect(self.database)) as conn, conn:
            with self.assertRaisesRegex(sqlite3.IntegrityError, "reached 10 messages"):
                conn.execute(ADD, ("one", "user", "over limit", None))
            with self.assertRaisesRegex(sqlite3.IntegrityError, "reached 10 messages"):
                conn.execute("UPDATE messages SET display_kind = NULL WHERE display_kind = 'hidden'")
            self.assertEqual(conn.execute("SELECT count(*) FROM hcv_test_chat_messages").fetchone()[0], 10)
            conn.execute(ADD, ("two", "user", "fresh start", None))

    def test_seed_above_the_limit_is_rejected_before_the_window_opens(self):
        with closing(sqlite3.connect(self.database)) as conn, conn:
            conn.executemany(ADD, [("over", "user", "visible", None)] * 11)
        with self.assertRaisesRegex(ValueError, "has 11 messages, limit 10"):
            install_limit(self.database)


if __name__ == "__main__":
    unittest.main()
