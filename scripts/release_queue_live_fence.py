"""Generate exact Windows Hermes launch hooks without writing to the installation."""

import hashlib
import json
from pathlib import Path
import stat


MARKER_NAME = ".hcv-codex-visual-maintenance.json"
PROBE_NAME = ".hcv-codex-visual-probe.json"
PROBE_TOKEN_ENV = "HCV_RELEASE_PROBE_TOKEN"
LEASE_DIR_NAME = ".hcv-codex-visual-starts"
BLOCKED_EXIT_CODE = 73
_PROBE_PATHS = ("HERMES_HOME", "APPDATA", "LOCALAPPDATA")
_PROBE_OVERRIDES = ("HERMES_DESKTOP_USER_DATA_DIR", "HERMES_GATEWAY_LOCK_DIR", "XDG_STATE_HOME")

_DESKTOP = "hermes-agent/apps/desktop"
_PACKAGED = f"{_DESKTOP}/release/win-unpacked"
_MAIN_SHA = "b3a61b560182a7162fd3fdbc98eeede3041ab69d21d6eb8e0cbabf6585bf9059"
_ARTIFACTS = {
    f"{_PACKAGED}/Hermes.exe": "4f3e6922af96562f96d26be3210913150546d79cdabb5a8cea2f20741d248b55",
    f"{_PACKAGED}/resources/app.asar": "fbcd4ed660e14bbca0f85a552e8ce482402bd9447cc0b7166dba7cf549838507",
}
_TARGETS = (
    (f"{_PACKAGED}/resources/app.asar.unpacked/dist/electron-main.mjs", _MAIN_SHA, None, "desktop"),
    (f"{_DESKTOP}/dist/electron-main.mjs", _MAIN_SHA, None, "desktop"),
    (
        "hermes-agent/hermes_cli/main.py",
        "321236ee6372d077b028d5618e62e3aeb8a69119dcd206428d2025252e1c4df4",
        b"# hermes_bootstrap must be the very first import",
        "cli",
    ),
    (
        "hermes-agent/cli.py",
        "b00849345c5ad7f63297fabeb11964295f8258c9dab2b742c54ee28282bc7efe",
        b"# Must be the very first import",
        "cli",
    ),
    (
        "hermes-agent/gateway/run.py",
        "fdb7c81839a1a4d8c8cdeedf53a06fb422a9d8ef813804555d7a427778e0aac5",
        b"# hermes_bootstrap must be the very first import",
        "gateway",
    ),
    (
        "hermes-agent/gateway/run_bootstrap.py",
        "bbe7fd3ef0a7bb2a5396846f670d2bcd3e84d447b103b87417f4552b9249390f",
        b"import logging",
        "gateway",
    ),
)


class GatePatchError(RuntimeError):
    """The installation layout or bytes changed since the reviewed preimage."""


def _desktop_guard(root):
    return f"""// HCV Windows maintenance admission
import * as hcvAdmissionFs from 'node:fs';
import * as hcvAdmissionPath from 'node:path';
import {{ createHash as hcvHash, randomUUID as hcvAdmissionNonce, timingSafeEqual as hcvEqual }} from 'node:crypto';
import {{ app as hcvAdmissionApp }} from 'electron';
{{
  const root = {json.dumps(str(root))};
  const markerPath = hcvAdmissionPath.join(root, {MARKER_NAME!r});
  const directory = hcvAdmissionPath.join(root, {LEASE_DIR_NAME!r});
  const nonce = hcvAdmissionNonce().replaceAll('-', '');
  const ticket = hcvAdmissionPath.join(directory, 'desktop.' + process.pid + '.' + nonce + '.lease');

  function readDocument(file) {{
    const info = hcvAdmissionFs.lstatSync(file);
    if (!info.isFile() || info.size > 16384) throw new Error('Invalid maintenance document');
    const bytes = hcvAdmissionFs.readFileSync(file);
    if (bytes.length > 16384) throw new Error('Oversized maintenance document');
    const value = JSON.parse(new TextDecoder('utf-8', {{ fatal: true }}).decode(bytes));
    if (!value || value.schema !== 1 || typeof value.intent_id !== 'string' || !value.intent_id.trim()) {{
      throw new Error('Invalid maintenance request');
    }}
    return value;
  }}

  function realDirectory(value) {{
    if (typeof value !== 'string' || !hcvAdmissionPath.isAbsolute(value) ||
        hcvAdmissionPath.parse(value).root.length < 2) {{
      throw new Error('Expected an absolute probe directory');
    }}
    const resolved = hcvAdmissionFs.realpathSync.native(value);
    if (!hcvAdmissionFs.statSync(resolved).isDirectory()) throw new Error('Expected a probe directory');
    return resolved;
  }}

  function inside(parent, child) {{
    const relative = hcvAdmissionPath.relative(parent, child);
    return relative !== '' && relative !== '..' && !relative.startsWith('..' + hcvAdmissionPath.sep) &&
      !hcvAdmissionPath.isAbsolute(relative);
  }}

  function admitProbe() {{
    const token = process.env[{PROBE_TOKEN_ENV!r}];
    if (!token) return false;
    const marker = readDocument(markerPath);
    const permit = readDocument(hcvAdmissionPath.join(root, {PROBE_NAME!r}));
    if (typeof marker.project !== 'string' || !marker.project.trim() || marker.intent_id !== permit.intent_id ||
        typeof permit.token_sha256 !== 'string' || permit.token_sha256.length !== 64 ||
        !/^[0-9a-f]{{64}}$/i.test(permit.token_sha256) ||
        !hcvEqual(hcvHash('sha256').update(token, 'utf8').digest(), Buffer.from(permit.token_sha256, 'hex'))) {{
      return false;
    }}
    const scope = realDirectory(permit.probe_root);
    const runtime = realDirectory(root);
    if (hcvAdmissionPath.relative(scope, runtime) === '' || inside(scope, runtime) || inside(runtime, scope)) {{
      return false;
    }}
    const scoped = value => {{
      const resolved = realDirectory(value);
      if (!inside(scope, resolved)) throw new Error('Probe directory is outside its scope');
      return resolved;
    }};
    const env = Object.fromEntries({json.dumps(_PROBE_PATHS)}.map(key => [key, scoped(process.env[key])]));
    for (const key of {json.dumps(_PROBE_OVERRIDES)}) {{
      if (process.env[key]) env[key] = scoped(process.env[key]);
    }}
    const homeParent = hcvAdmissionPath.dirname(env.HERMES_HOME);
    if (hcvAdmissionPath.basename(homeParent).toLowerCase() === 'profiles' &&
        !inside(scope, hcvAdmissionPath.dirname(homeParent))) return false;
    if (process.env.HERMES_DESKTOP_REMOTE_URL) return false;
    if (!env.HERMES_DESKTOP_USER_DATA_DIR) {{
      const userData = hcvAdmissionPath.join(env.APPDATA, 'Hermes');
      hcvAdmissionFs.mkdirSync(userData, {{ recursive: true }});
      env.HERMES_DESKTOP_USER_DATA_DIR = scoped(userData);
    }}
    env.HERMES_GATEWAY_LOCK_DIR ??= env.LOCALAPPDATA;
    env.XDG_STATE_HOME ??= env.LOCALAPPDATA;
    hcvAdmissionApp.setPath('home', scope);
    hcvAdmissionApp.setPath('appData', env.APPDATA);
    hcvAdmissionApp.setPath('userData', env.HERMES_DESKTOP_USER_DATA_DIR);
    hcvAdmissionApp.setPath('sessionData', env.HERMES_DESKTOP_USER_DATA_DIR);
    Object.assign(process.env, env, {{
      HOME: scope,
      USERPROFILE: scope,
      HERMES_DESKTOP_ISOLATED_BACKEND: '1',
      HERMES_DESKTOP_IGNORE_EXISTING: '1',
      HERMES_DESKTOP_SKIP_PROTOCOL_REGISTRATION: '1',
    }});
    return true;
  }}

  let admitted = false;
  try {{
    hcvAdmissionFs.mkdirSync(directory, {{ recursive: true }});
    if (!hcvAdmissionFs.lstatSync(directory).isDirectory()) {{
      throw new Error('Maintenance admission requires a plain directory');
    }}
    hcvAdmissionFs.closeSync(hcvAdmissionFs.openSync(ticket, 'wx'));
    try {{
      hcvAdmissionFs.lstatSync(markerPath);
    }} catch (error) {{
      if (error.code !== 'ENOENT') throw error;
      admitted = true;
    }}
    if (!admitted) admitted = admitProbe();
  }} catch {{
    // A failed ticket publication or barrier inspection closes admission.
  }}
  if (!admitted) {{
    hcvAdmissionApp.exit({BLOCKED_EXIT_CODE});
  }}
}}

""".encode("ascii")


def _python_guard(root, kind, newline):
    # A later import in an admitted process inherits its admission.
    # Including the PID forces a new ticket in a forked interpreter.
    snippet = f"""# HCV Windows maintenance admission
def _hcv_windows_admit_runtime():
    import hashlib
    import hmac
    import json
    import os
    from pathlib import Path
    import re
    import stat
    import sys
    from uuid import uuid4

    root = Path({str(root)!r})
    pid = os.getpid()
    admission = (str(root), pid)
    if getattr(sys, "_hcv_windows_admission", None) == admission:
        return

    def reject_json_constant(_):
        raise ValueError("Invalid JSON constant")

    def read_document(path):
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_size > 16384:
            raise ValueError("Invalid maintenance document")
        with path.open("rb") as stream:
            content = stream.read(16385)
        if len(content) > 16384:
            raise ValueError("Oversized maintenance document")
        value = json.loads(content.decode("utf-8-sig"), parse_constant=reject_json_constant)
        if not isinstance(value, dict) or type(value.get("schema")) not in (int, float) or value["schema"] != 1:
            raise ValueError("Invalid maintenance request")
        if not isinstance(value.get("intent_id"), str) or not value["intent_id"].strip():
            raise ValueError("Invalid maintenance request")
        return value

    def real_directory(value):
        if not isinstance(value, str) or not Path(value).is_absolute():
            raise ValueError("Expected an absolute probe directory")
        resolved = Path(value).resolve(strict=True)
        if not resolved.is_dir():
            raise ValueError("Expected a probe directory")
        return resolved

    def inside(parent, child):
        return child != parent and child.is_relative_to(parent)

    def admit_probe(marker_path):
        token = os.environ.get({PROBE_TOKEN_ENV!r})
        if not token:
            return False
        marker = read_document(marker_path)
        permit = read_document(root / {PROBE_NAME!r})
        digest = permit.get("token_sha256")
        if (
            not isinstance(marker.get("project"), str) or not marker["project"].strip()
            or marker["intent_id"] != permit["intent_id"]
            or not isinstance(digest, str) or not re.fullmatch("[0-9a-fA-F]{{64}}", digest)
            or not hmac.compare_digest(hashlib.sha256(token.encode("utf-8")).hexdigest(), digest.lower())
        ):
            return False
        scope = real_directory(permit.get("probe_root"))
        runtime = root.resolve(strict=True)
        if scope == runtime or inside(scope, runtime) or inside(runtime, scope):
            return False

        def scoped(value):
            resolved = real_directory(value)
            if not inside(scope, resolved):
                raise ValueError("Probe directory is outside its scope")
            return resolved

        env = {{key: str(scoped(os.environ.get(key))) for key in {_PROBE_PATHS!r}}}
        for key in {_PROBE_OVERRIDES!r}:
            if os.environ.get(key):
                env[key] = str(scoped(os.environ[key]))
        parent = Path(env["HERMES_HOME"]).parent
        if parent.name.lower() == "profiles" and not inside(scope, parent.parent):
            return False
        if os.environ.get("HERMES_DESKTOP_REMOTE_URL"):
            return False
        env.setdefault("HERMES_GATEWAY_LOCK_DIR", env["LOCALAPPDATA"])
        env.setdefault("XDG_STATE_HOME", env["LOCALAPPDATA"])
        env.update(HOME=str(scope), USERPROFILE=str(scope))
        os.environ.update(env)
        return True

    try:
        directory = root / {LEASE_DIR_NAME!r}
        directory.mkdir(exist_ok=True)
        info = directory.lstat()
        if not stat.S_ISDIR(info.st_mode) or (
            getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT
        ):
            raise OSError("Maintenance admission requires a plain directory")
        ticket = directory / f"{kind}.{{pid}}.{{uuid4().hex}}.lease"
        with ticket.open("xb"):
            pass
        marker_path = root / {MARKER_NAME!r}
        try:
            marker_path.lstat()
        except FileNotFoundError:
            sys._hcv_windows_admission = admission
            return
        if admit_probe(marker_path):
            sys._hcv_windows_admission = admission
            return
    except (OSError, RuntimeError, ValueError):
        pass
    raise SystemExit({BLOCKED_EXIT_CODE})


_hcv_windows_admit_runtime()
del _hcv_windows_admit_runtime

"""
    return snippet.replace("\n", newline).encode("utf-8")


def _regular_file(root, relative):
    path = root
    try:
        for part in Path(relative).parts:
            path = path / part
            attributes = path.lstat()
            if stat.S_ISLNK(attributes.st_mode) or (
                getattr(attributes, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT
            ):
                raise GatePatchError(f"Launch path is a link or reparse point: {path}")
        if not stat.S_ISREG(attributes.st_mode):
            raise GatePatchError(f"Expected a regular launch file: {path}")
    except OSError as error:
        raise GatePatchError(f"Cannot inspect launch file {path}: {error}") from error
    return path


def _insert(original, hook, anchor):
    if anchor is None:
        return hook + original
    if original.count(anchor) != 1:
        raise GatePatchError(f"Expected exactly one launch hook location: {anchor!r}")
    return original.replace(anchor, hook + anchor, 1)


def _reject_unchecked_bytecode(target):
    cache = target.parent / "__pycache__"
    try:
        info = cache.lstat()
    except FileNotFoundError:
        return
    if not stat.S_ISDIR(info.st_mode) or (
        getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT
    ):
        raise GatePatchError(f"Expected a plain Python cache directory: {cache}")
    for entry in cache.iterdir():
        if not entry.name.startswith(target.stem + ".") or entry.suffix != ".pyc":
            continue
        bytecode = _regular_file(cache, entry.name)
        with bytecode.open("rb") as stream:
            header = stream.read(8)
        if len(header) != 8 or int.from_bytes(header[4:], "little") == 1:
            raise GatePatchError(f"Unreviewed Python cache can skip guarded source: {bytecode}")


def patch_gate_files(hermes_root):
    """Return target paths and before/after bytes. Never write to the installation.

    hermes_root contains hermes-agent, normally %LOCALAPPDATA%/hermes. An exact
    installed hook returns equal before/after bytes. Unknown builds are rejected.
    """
    root = Path(hermes_root)
    if not root.is_absolute() or not root.is_dir() or root.resolve() != root:
        raise GatePatchError(f"Expected a canonical absolute Hermes installation directory: {root}")
    for relative, expected in _ARTIFACTS.items():
        target = _regular_file(root, relative)
        with target.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != expected:
                raise GatePatchError(f"Unreviewed Windows Desktop artifact: {target}")

    result = []
    for relative, expected, anchor, kind in _TARGETS:
        target = _regular_file(root, relative)
        if target.suffix == ".py":
            _reject_unchecked_bytecode(target)
        current = target.read_bytes()
        newline = "\r\n" if b"\r\n" in current else "\n"
        hook = _desktop_guard(root) if anchor is None else _python_guard(root, kind, newline)
        if hashlib.sha256(current).hexdigest() == expected:
            original = current
            after = _insert(current, hook, anchor)
        else:
            original = (
                current.removeprefix(hook) if anchor is None
                else current.replace(hook + anchor, anchor, 1)
            )
            if hashlib.sha256(original).hexdigest() != expected or _insert(original, hook, anchor) != current:
                raise GatePatchError(f"Unreviewed launch file: {target}")
            after = current
        result.append({"target": target, "before": current, "after": after, "original": original})
    return result


def verify_gate_files(hermes_root):
    """Raise if a hook is absent or a reviewed installation has changed."""
    for entry in patch_gate_files(hermes_root):
        if entry["before"] != entry["after"]:
            raise GatePatchError(f"Maintenance admission is absent: {entry['target']}")
