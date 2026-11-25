"""Install the verified local ZIP's desktop module, preserving the previous one."""

from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile
import os
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
PREVIOUS = "c394eadb375bb766fcc1e0d7da6a7ff17adfef16aeead1628042aff4d53eb6db"
ARCHIVE = "8cf79ca62d018a06a72bf67cda86f689034af6d98b8ac2f01a294009f4fc958c"
CANDIDATE = "c83f85b989e516114c3aec3f944cbbedf4f2d7ad3a62b9c5249f77bebdbf1464"


def digest(data):
    return sha256(data).hexdigest()


def main():
    if sys.argv[1:] != ["--install"]:
        raise SystemExit("Pass --install only for the verified local release.")
    archive = ROOT / "dist/hermes-codex-visual-v0.15.100-local.zip"
    if digest(archive.read_bytes()) != ARCHIVE:
        raise RuntimeError("The verified ZIP has changed.")
    with ZipFile(archive) as package:
        module = package.read("hermes-codex-visual/plugin.js")
    if digest(module) != CANDIDATE:
        raise RuntimeError("The ZIP module does not match the verified release.")
    target = Path(os.environ["LOCALAPPDATA"]) / "hermes/desktop-plugins/hermes-codex-visual/plugin.js"
    if target.is_symlink() or not target.is_file():
        raise RuntimeError("The installed desktop module is missing or is a link.")
    previous = target.read_bytes()
    if digest(previous) != PREVIOUS:
        raise RuntimeError("Another release changed the installed module; installation stopped.")
    backup = ROOT / ".local" / ("approval-desktop-rollback-" + uuid.uuid4().hex + ".js")
    with backup.open("xb") as out:
        out.write(previous)
    temporary = target.with_name(".hcv-approval-" + uuid.uuid4().hex + ".tmp")
    try:
        with temporary.open("xb") as out:
            out.write(module)
            out.flush()
            os.fsync(out.fileno())
        if digest(target.read_bytes()) != PREVIOUS:
            raise RuntimeError("The installed module changed during installation.")
        os.replace(temporary, target)
    finally:
        if temporary.exists():
            temporary.unlink()
    if digest(target.read_bytes()) != CANDIDATE:
        raise RuntimeError("The desktop module failed verification; restore the backup.")
    print(f"Installed module SHA-256: {CANDIDATE}")
    print(f"Backup: {backup}")


if __name__ == "__main__":
    main()
