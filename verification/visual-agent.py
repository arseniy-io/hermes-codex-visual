"""Read the Codex reference and run selected Hermes checks on an exact module."""

import argparse
import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path
from zipfile import BadZipFile, ZipFile


ROOT = Path(__file__).resolve().parent.parent
PLUGIN_ID = "hermes-codex-visual"
MODULE = f"{PLUGIN_ID}/plugin.js"
SCENARIOS = ("session-navigation",)


def digest(payload):
    return hashlib.sha256(payload).hexdigest()


def file_digest(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def hermes_root():
    return Path(os.environ["LOCALAPPDATA"]) / "hermes"


def installed_module():
    return hermes_root() / "desktop-plugins" / MODULE


def codex_package():
    command = (
        "[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); "
        "Get-AppxPackage -Name OpenAI.Codex | "
        "Select-Object Version,InstallLocation | ConvertTo-Json -Compress"
    )
    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command],
        capture_output=True, encoding="utf-8", check=True, timeout=25,
    )
    package = json.loads(result.stdout) if result.stdout.strip() else None
    if not isinstance(package, dict):
        raise ValueError("Expected one installed OpenAI.Codex package")
    asar = Path(package["InstallLocation"]) / "app" / "resources" / "app.asar"
    if not asar.is_file():
        raise ValueError(f"Codex archive is missing: {asar}")
    return package["Version"], asar


def inspect_inputs():
    version, asar = codex_package()
    module = installed_module()
    installed_hash = digest(module.read_bytes())
    marker = Path(os.environ["APPDATA"]) / "Hermes" / "plugin-files/data" / PLUGIN_ID / "loaded-version.json"
    loaded = read_json(marker) if marker.is_file() else {}
    local_module = ROOT / ".local" / "plugin.js"
    local_hash = digest(local_module.read_bytes()) if local_module.is_file() else None
    archives = []
    for path in sorted((ROOT / "dist").glob(f"{PLUGIN_ID}-v*-local.zip")):
        try:
            with ZipFile(path) as archive:
                module_hash = digest(archive.read(MODULE))
            archives.append({
                "file": path.name,
                "moduleSha256": module_hash,
                "matchesInstalled": module_hash == installed_hash,
            })
        except (BadZipFile, KeyError, OSError) as error:
            archives.append({"file": path.name, "readError": str(error)})
    return {
        "codex": {"version": version, "archive": str(asar)},
        "hermes": {
            "installed": str(module), "moduleSha256": installed_hash,
            "reportedVersion": loaded.get("version"), "reportedLoadedAt": loaded.get("loadedAt"),
            "reportedTheme": loaded.get("theme"),
        },
        "workspace": {
            "version": read_json(ROOT / "package.json")["version"],
            "localModuleSha256": local_hash,
            "localModuleMatchesInstalled": local_hash == installed_hash,
            "archives": archives,
        },
    }


def read_asset(asar, name):
    if not re.fullmatch(r"[A-Za-z0-9_.-]+\.(?:js|css)", name):
        raise ValueError("Pass the exact basename of a JS or CSS asset")
    with asar.open("rb") as archive:
        prefix = archive.read(16)
        if len(prefix) != 16:
            raise ValueError("Incomplete Codex archive header")
        _, header_size, _, index_size = struct.unpack("<4I", prefix)
        if not 0 < index_size <= min(header_size, 64 * 1024 * 1024):
            raise ValueError("Invalid Codex archive index")
        tree = json.loads(archive.read(index_size))["files"]
        files = tree["webview"]["files"]["assets"]["files"]
        locations = [
            (f"webview/assets/{name}", files.get(name)),
            (f"webview/assets/async/{name}", files.get("async", {}).get("files", {}).get(name)),
        ]
        matches = [(path, entry) for path, entry in locations if entry and "offset" in entry]
        if len(matches) != 1:
            raise ValueError(f"Expected one packed Codex asset named {name}; found {len(matches)}")
        path, entry = matches[0]
        size = entry["size"]
        offset = int(entry["offset"])
        if not 0 <= size <= 64 * 1024 * 1024 or offset < 0:
            raise ValueError(f"Invalid asset size or offset: {path}")
        archive.seek(8 + header_size + offset)
        payload = archive.read(size)
        if len(payload) != size:
            raise ValueError(f"Incomplete Codex asset: {path}")
    return path, payload


def inspect_source(name, needle):
    if not needle.strip() or len(needle) > 300:
        raise ValueError("Pass a nonempty source fragment of up to 300 characters")
    version, asar = codex_package()
    path, payload = read_asset(asar, name)
    source = payload.decode("utf-8")
    position = source.find(needle)
    if position < 0:
        raise ValueError(f"Fragment not found in {path} on Codex {version}")
    return {
        "codexVersion": version,
        "asset": path,
        "sha256": digest(payload),
        "firstCharacterOffset": position,
        "occurrences": source.count(needle),
        "excerpt": source[max(0, position - 120):position + len(needle) + 200],
    }


def test_inputs(args):
    desktop = args.desktop.resolve(strict=True)
    fixtures = (args.fixture_desktop or desktop).resolve(strict=True)
    python = args.python.resolve(strict=True)
    runner = fixtures.parents[1] / "node_modules/@playwright/test/cli.js"
    required = (desktop / "dist/electron-main.mjs", fixtures / "e2e/fixtures.ts", python, runner, args.electron)
    for path in required:
        if not path.is_file():
            raise ValueError(f"Required trusted test input is missing: {path}")
    return desktop, fixtures, python, runner


def probe(args):
    desktop, fixtures, python, runner = test_inputs(args)
    installed_before = installed_module().read_bytes()
    installed_hash = digest(installed_before)
    if args.expect_installed and args.expect_installed.lower() != installed_hash:
        raise ValueError(f"Installed module changed before the probe: {installed_hash}")
    chosen = installed_before
    role = "installed"
    if args.zip:
        archive_path = args.zip.resolve(strict=True)
        version = read_json(ROOT / "package.json")["version"]
        lock = read_json(ROOT / "package-lock.json")
        if lock["version"] != version or lock["packages"][""]["version"] != version:
            raise ValueError("The source manifests disagree on the release version")
        if (archive_path.parent != (ROOT / "dist").resolve()
                or archive_path.name != f"{PLUGIN_ID}-v{version}-local.zip"):
            raise ValueError("Use the current verified local ZIP from this project's dist directory")
        with ZipFile(archive_path) as archive:
            if sorted(archive.namelist()) != sorted([
                MODULE, f"{PLUGIN_ID}/LICENSE", f"{PLUGIN_ID}/THIRD_PARTY_NOTICES.txt",
            ]):
                raise ValueError("Unexpected local ZIP contents")
            if archive.testzip():
                raise ValueError("Damaged local ZIP")
            chosen = archive.read(MODULE)
        if chosen != (ROOT / ".local/plugin.js").read_bytes():
            raise ValueError("Local ZIP module differs from this project's .local/plugin.js")
        role = "candidate"
    module_hash = digest(chosen)
    run = f"visual-agent-{uuid.uuid4().hex[:12]}"
    result_path = ROOT / "evidence" / f"{run}-{args.scenario}.json"
    test_entry = desktop / "dist/electron-main.mjs"
    entry_hash = file_digest(test_entry)
    build_record = desktop / "dist/hermes-build.json"
    build_hash = read_json(build_record)["outputHash"] if build_record.is_file() else None
    env = {
        key: value for key, value in os.environ.items()
        if not key.upper().startswith(("GIT_", "HERMES_"))
        and key.upper() not in {"NODE_OPTIONS", "NODE_PATH", "PYTHONHOME", "PYTHONPATH"}
    }
    env.update({
        "HERMES_VISUAL_DESKTOP": str(desktop),
        "HERMES_VISUAL_FIXTURE_DESKTOP": str(fixtures),
        "HERMES_VISUAL_PYTHON": str(python),
        "HERMES_VISUAL_MODE": "candidate",
        "HERMES_VISUAL_FOCUS": args.scenario,
        "HERMES_VISUAL_EVIDENCE_VERSION": run,
        "HERMES_VISUAL_GPU": "1",
        "HERMES_VISUAL_ELECTRON": str(args.electron.resolve(strict=True)),
    })
    if args.observe:
        env["HERMES_VISUAL_NAVIGATION_OBSERVE"] = "1"
    node = shutil.which("node")
    if not node:
        raise ValueError("Node.js is required by the trusted Playwright runner")
    print(f"Running {args.scenario} on {role} module {module_hash} ({run})", file=sys.stderr, flush=True)
    with tempfile.TemporaryDirectory(prefix="hermes-visual-agent-") as staging:
        module = Path(staging) / "plugin.js"
        module.write_bytes(chosen)
        env["HERMES_VISUAL_FIXTURE_PLUGIN"] = str(module)
        result = subprocess.run(
            [node, str(runner), "test", "--config", str(ROOT / "verification/playwright.config.mjs")],
            cwd=ROOT, env=env, stdout=sys.stderr, stderr=sys.stderr, timeout=190,
        )
        if result.returncode:
            raise ValueError(f"Playwright failed ({result.returncode}); evidence prefix: {run}")
    report = read_json(result_path)
    if report.get("moduleSha256") != module_hash:
        raise ValueError(f"Playwright report does not prove the chosen module: {result_path}")
    if installed_before != installed_module().read_bytes():
        raise ValueError(f"Installed module changed during the probe; report applies only to {module_hash}: {result_path}")
    if entry_hash != file_digest(test_entry):
        raise ValueError(f"Test Desktop entry changed during the probe: {result_path}")
    observed_build = read_json(build_record)["outputHash"] if build_record.is_file() else None
    if build_hash != observed_build:
        raise ValueError(f"Test Desktop build changed during the probe: {result_path}")
    record = {
        "scenario": args.scenario, "moduleRole": role, "moduleSha256": module_hash,
        "installedSha256": installed_hash, "observationsOnly": args.observe,
        "testDesktop": str(desktop), "testDesktopEntrySha256": entry_hash, "testDesktopOutputHash": build_hash,
        "testElectron": env["HERMES_VISUAL_ELECTRON"], "runtime": report["runtime"],
    }
    report["probe"] = record
    result_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {
        **record, "report": str(result_path),
        "images": [str(path) for path in sorted(result_path.parent.glob(f"{run}-*.png"))],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("status", help="Read the installed Codex and Hermes versions and local ZIP identities")
    source = commands.add_parser("source", help="Read a short fragment and checksum of a Codex JS/CSS asset")
    source.add_argument("asset")
    source.add_argument("fragment")
    trial = commands.add_parser("probe", help="Playwright check in a separate Hermes profile")
    trial.add_argument("scenario", choices=SCENARIOS)
    trial.add_argument("--desktop", type=Path, required=True)
    trial.add_argument("--fixture-desktop", type=Path, help="Trusted Desktop tree with the existing test fixtures")
    trial.add_argument("--python", type=Path, required=True, help="Trusted Hermes Python from LOCAL-README.md")
    trial.add_argument("--electron", type=Path, required=True)
    trial.add_argument("--zip", type=Path, help="Test the verified current local ZIP instead of the installed module")
    trial.add_argument("--observe", action="store_true", help="Collect session navigation measurements before target assertions")
    trial.add_argument("--expect-installed", metavar="SHA256", help="Reject a changed installed module before the probe")
    args = parser.parse_args()
    try:
        if args.command == "status":
            output = inspect_inputs()
        elif args.command == "source":
            output = inspect_source(args.asset, args.fragment)
        else:
            output = probe(args)
    except (BadZipFile, KeyError, OSError, ValueError, subprocess.SubprocessError) as error:
        print(f"Visual agent: {error}", file=sys.stderr)
        return 1
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
