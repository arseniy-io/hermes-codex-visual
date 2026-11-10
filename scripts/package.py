"""Pack the built plugin and write a SHA-256 file for the release assets."""

from hashlib import sha256
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / "package.json").read_text(encoding="utf-8"))
plugin_id, version = manifest["name"], manifest["version"]
dist = root / "dist"
dist.mkdir(exist_ok=True)
archive = dist / f"{plugin_id}-v{version}.zip"
files = ("plugin.js", "LICENSE", "THIRD_PARTY_NOTICES.txt")

with ZipFile(archive, "w") as package:
    for name in files:
        entry = ZipInfo(f"{plugin_id}/{name}", (2026, 1, 1, 0, 0, 0))
        entry.external_attr = 0o644 << 16
        package.writestr(entry, (root / name).read_bytes(), ZIP_DEFLATED, compresslevel=9)

with ZipFile(archive) as package:
    assert package.namelist() == [f"{plugin_id}/{name}" for name in files]
    assert package.read(f"{plugin_id}/plugin.js") == (root / "plugin.js").read_bytes()

checksums = "".join(
    f"{sha256(path.read_bytes()).hexdigest()}  {path.name}\n"
    for path in (archive, root / "plugin.js")
)
(dist / "SHA256SUMS.txt").write_text(checksums, encoding="utf-8", newline="\n")
print(f"Wrote {archive.name}\n{checksums}", end="")
