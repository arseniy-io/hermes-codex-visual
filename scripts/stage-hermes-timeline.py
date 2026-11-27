"""Stage the pinned chat timeline companion without changing installed Hermes."""
from __future__ import annotations

import argparse
import ast
from hashlib import sha256
import json
import os
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CORE = Path(os.environ.get("LOCALAPPDATA", "")) / "hermes/hermes-agent"
OUT = ROOT / ".local/hermes-timeline-check/candidate"
ASSETS = ROOT / "source/hermes-timeline"


def digest(data):
    return sha256(data).hexdigest()


def safe_relative(name):
    path = Path(name)
    if path.is_absolute() or not path.parts or any(part in (".", "..") for part in path.parts) or ":" in name or "\\" in name:
        raise RuntimeError("Unsafe companion path: " + name)
    return path


def checked_path(root, name, *, exists=True):
    target = root / safe_relative(name)
    if target.is_symlink() or not target.parent.resolve(strict=True).is_relative_to(root.resolve(strict=True)):
        raise RuntimeError("Unexpected source path: " + name)
    if exists and not target.is_file():
        raise RuntimeError("Missing Hermes source: " + name)
    return target


def patches(text):
    """Read only ordinary unified diffs for manifest-declared UTF-8 source files."""
    lines, output, index = text.splitlines(keepends=True), {}, 0
    while index < len(lines):
        if not lines[index].startswith("--- a/") or index + 1 >= len(lines) or not lines[index + 1].startswith("+++ b/"):
            raise RuntimeError("Malformed core patch file header")
        name = lines[index][6:].rstrip("\r\n")
        if lines[index + 1][6:].rstrip("\r\n") != name or name in output:
            raise RuntimeError("Mismatched or duplicate patch file: " + name)
        safe_relative(name)
        index += 2
        hunks = []
        while index < len(lines) and not lines[index].startswith("--- a/"):
            match = re.fullmatch(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@[^\n]*\n?", lines[index])
            if match is None:
                raise RuntimeError("Malformed patch hunk: " + name)
            start, removed, added_start, added = [int(value) if value is not None else 1 for value in match.groups()]
            index += 1
            body = []
            while index < len(lines) and not lines[index].startswith(("@@ ", "--- a/")):
                line = lines[index]
                if not line or line[0] not in " +-":
                    raise RuntimeError("Unsupported patch instruction: " + name)
                body.append(line); index += 1
            if sum(line[0] != "+" for line in body) != removed or sum(line[0] != "-" for line in body) != added:
                raise RuntimeError("Incorrect patch hunk length: " + name)
            hunks.append((start, removed, added_start, body))
        output[name] = hunks
    return output


def apply(raw, hunks, name):
    text = raw.decode("utf-8")
    newline = "\r\n" if "\r\n" in text else "\n"
    original, result, cursor = text.replace("\r\n", "\n").splitlines(keepends=True), [], 0
    for start, removed, added_start, body in hunks:
        offset = start - 1 if start else 0
        if offset < cursor:
            raise RuntimeError("Overlapping patch hunks: " + name)
        result.extend(original[cursor:offset])
        if len(result) != (added_start - 1 if added_start else 0):
            raise RuntimeError("Incorrect patch destination: " + name)
        old = [line[1:] for line in body if line[0] != "+"]
        if original[offset:offset + removed] != old:
            raise RuntimeError("Patch context changed: " + name)
        result.extend(line[1:] for line in body if line[0] != "-")
        cursor = offset + removed
    result.extend(original[cursor:])
    return "".join(result).replace("\n", newline).encode("utf-8")


def candidates(core=CORE):
    manifest = json.loads((ASSETS / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("version") != 1:
        raise RuntimeError("Unknown timeline companion manifest")
    transformations = patches((ASSETS / "core.patch").read_text(encoding="utf-8"))
    if set(transformations) != set(manifest["files"]):
        raise RuntimeError("Patch and pinned manifest do not declare the same files")
    originals, output = {}, {}
    for name, hashes in manifest["files"].items():
        raw = checked_path(core, name).read_bytes()
        actual = digest(raw)
        if actual == hashes["candidate"]:
            candidate = raw
        elif isinstance(upgrade := hashes.get("upgrade"), dict) and actual == upgrade.get("from"):
            transition = patches(upgrade["patch"])
            if set(transition) != {name}:
                raise RuntimeError("Invalid pinned upgrade: " + name)
            candidate = apply(raw, transition[name], name)
        elif actual == hashes["baseline"]:
            candidate = apply(raw, transformations[name], name)
        else:
            raise RuntimeError("Installed Hermes changed; refusing unverified source: " + name)
        if digest(candidate) != hashes["candidate"]:
            raise RuntimeError("Candidate hash does not match pinned source: " + name)
        if name.endswith(".py"):
            ast.parse(candidate.decode("utf-8"), filename=name)
        originals[name], output[name] = raw, candidate
    helpers = manifest.get("helpers")
    if not isinstance(helpers, list) or not helpers:
        raise RuntimeError("The timeline companion must declare its helpers")
    for helper in helpers:
        raw = (ASSETS / safe_relative(helper["source"])).read_bytes()
        if digest(raw) != helper["candidate"]:
            raise RuntimeError("The timeline helper changed")
        ast.parse(raw.decode("utf-8"), filename=helper["target"])
        if helper["target"] in output:
            raise RuntimeError("Duplicate companion target")
        target = checked_path(core, helper["target"], exists=False)
        if target.exists():
            original = target.read_bytes()
            supported = {helper["candidate"], helper.get("baseline"), *helper.get("previous_candidates", ())}
            if digest(original) not in supported:
                raise RuntimeError("A different timeline helper is already installed")
            originals[helper["target"]] = original
        output[helper["target"]] = raw
    return originals, output


def write_candidate(out, core=CORE):
    originals, output = candidates(core)
    for name, raw in output.items():
        path = out / safe_relative(name)
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.is_symlink() or not path.parent.resolve(strict=True).is_relative_to(out.resolve(strict=True)):
            raise RuntimeError("Unexpected candidate path: " + name)
        path.write_bytes(raw)
    return originals, output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()
    _, output = write_candidate(args.out)
    print("Staged pinned chat timeline metadata:", len(output), "files; installed Hermes was not changed.")


if __name__ == "__main__":
    main()
