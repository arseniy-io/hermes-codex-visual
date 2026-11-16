"""Pack the built plugin and write a SHA-256 file for the release assets."""

from argparse import ArgumentParser
from hashlib import sha256
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


args = ArgumentParser(description=__doc__)
args.add_argument("--local", action="store_true", help="Package the private local build")
local = args.parse_args().local
root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / "package.json").read_text(encoding="utf-8"))
plugin_id, version = manifest["name"], manifest["version"]
dist = root / "dist"
dist.mkdir(exist_ok=True)
archive = dist / f"{plugin_id}-v{version}{'-local' if local else ''}.zip"
module = root / (".local/plugin.js" if local else "plugin.js")
files = ("plugin.js", "LICENSE", "THIRD_PARTY_NOTICES.txt")

with ZipFile(archive, "w") as package:
    for name in files:
        entry = ZipInfo(f"{plugin_id}/{name}", (2026, 1, 1, 0, 0, 0))
        entry.external_attr = 0o644 << 16
        source = module if name == "plugin.js" else root / name
        package.writestr(entry, source.read_bytes(), ZIP_DEFLATED, compresslevel=9)

with ZipFile(archive) as package:
    assert package.namelist() == [f"{plugin_id}/{name}" for name in files]
    assert package.read(f"{plugin_id}/plugin.js") == module.read_bytes()

checksums = "".join(
    f"{sha256(path.read_bytes()).hexdigest()}  {path.name}\n"
    for path in (archive, module)
)
(dist / "SHA256SUMS.txt").write_text(checksums, encoding="utf-8", newline="\n")
print(f"Wrote {archive.name}\n{checksums}", end="")
