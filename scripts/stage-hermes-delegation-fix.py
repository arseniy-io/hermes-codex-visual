"""Stage the version-pinned Hermes queue repair for isolated verification."""

from hashlib import sha256
from pathlib import Path
import os


ROOT = Path(__file__).resolve().parents[1]
CORE = Path(os.environ['LOCALAPPDATA']) / 'hermes' / 'hermes-agent'
STAGE = ROOT / '.local' / 'hermes-delegation-check' / 'candidate' / 'gateway'
EXPECTED = 'a5c8e95cdd8a5bed0248341cb9b1502fb5215c35f6b7745c097d5201ab459424'


def replace_once(text, before, after):
    if text.count(before) != 1:
        raise RuntimeError('Installed Hermes source no longer matches the verified patch point.')
    return text.replace(before, after, 1)


def candidate(original):
    text = replace_once(original,
        '        backoff, conflicted, refusing = 0.0, None, None\n        while True:',
        '        backoff, conflicted, refusing = 0.0, None, None\n        delegation_retry = {}\n        while True:')
    text = replace_once(text,
        "                        head = next((row['admission_id'] for row in list_session_admissions(\n"
        "                            self.db, session_id=ref.session_id) if row['status'] == 'queued'), None)\n"
        "                        if head is not None and head != conflicted:",
        "                        head_row = next((row for row in list_session_admissions(\n"
        "                            self.db, session_id=ref.session_id) if row['status'] == 'queued'), None)\n"
        "                        head = head_row['admission_id'] if head_row is not None else None\n"
        "                        if head_row is not None:\n"
        "                            from gateway.hcv_delegation_retry import retryable_local_delegation, defer\n"
        "                            if await asyncio.to_thread(retryable_local_delegation, self, ref, live, head_row):\n"
        "                                if self._drain_stopping(ref, live):\n"
        "                                    return None\n"
        "                                await defer(self, ref, live, head, delegation_retry)\n"
        "                                continue\n"
        "                        if head is not None and head != conflicted:")
    return replace_once(text,
        "            if row != 'classic_busy':\n                return row, first\n",
        "            if row != 'classic_busy':\n"
        "                if delegation_retry:\n"
        "                    from gateway.hcv_delegation_retry import clear\n"
        "                    clear(ref, live, delegation_retry)\n"
        "                return row, first\n")


def main():
    source = CORE / 'gateway' / 'session_authority.py'
    raw = source.read_bytes()
    if sha256(raw).hexdigest() != EXPECTED:
        raise RuntimeError('Installed Hermes changed; refusing to stage an unverified patch.')
    STAGE.mkdir(parents=True, exist_ok=True)
    (STAGE / 'session_authority.py').write_text(candidate(raw.decode('utf-8')), encoding='utf-8', newline='')
    (STAGE / 'hcv_delegation_retry.py').write_bytes((ROOT / 'source/hermes-delegation/retry.py').read_bytes())
    for name in ('session_authority.py', 'hcv_delegation_retry.py'):
        print(name, sha256((STAGE / name).read_bytes()).hexdigest())


if __name__ == '__main__':
    main()
