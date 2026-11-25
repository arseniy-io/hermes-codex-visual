"""Read-only source-level diagnostic for the known local Hermes test runner.

This is not a launcher, a runtime verifier, or an installation check.  It
never imports a module from the examined environment.  Unexpected layouts and
errors are reported as unknown; observations may become stale immediately.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import tomllib
from email.parser import BytesParser


# Only the reviewed run-local.ps1 is interpreted.  A new runner needs review;
# a guess at PowerShell semantics could silently select the wrong interpreter.
TRUSTED_RUNNERS = frozenset({
    "9afed5d8c4d3b60643cedfebce47bba99f8af27e957dadac9cbfc98fbc633dc6",
})
# The AST checks below describe only these reviewed source bytes.  The host
# resolves _core dynamically; these hashes do not prove runtime binding.
TRUSTED_MCP_SOURCES = frozenset({
    "6cc73f8ec7d270bf30433a85c5b05a6384afdd08d543368c54187f94840e04e5",
})
TRUSTED_HOST_SOURCES = frozenset({
    "5fa2b2077d0dedc5c36cd40eecfa58a9a3a4d8875406c77e676fb285b183b990",
})
MAX_READ = 2_000_000
REPARSE_POINT = 0x400
KEY = re.compile(r"[0-9a-f]{16}\Z")
GENERATION = re.compile(r"[0-9a-f]{32}\Z")
VERSION = re.compile(r"[A-Za-z0-9.!+_-]{1,64}\Z")
RUNNER_PYTHON = re.compile(
    r"(?m)^\$env:HERMES_VISUAL_PYTHON = Join-Path \$hermesTestRoot "
    r"'installs/([0-9a-f]{16})/environments/([0-9a-f]{32})/venv/Scripts/python\.exe'\r?$"
)


class Unknown(Exception):
    """A known reason to stop rather than guess; codes do not contain paths."""


def _ident(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_size, info.st_mtime_ns,
            getattr(info, "st_file_attributes", 0))


def _inspect_path(path: Path, *, leaf_directory: bool):
    """Check lexical path and reject links/reparse points in every component.

    This detects common redirections, but is not a handle-relative atomic walk.
    Concurrent replacements can escape sequential checks: this is diagnostic
    evidence, not an authorization or security boundary.
    """
    if not path.is_absolute() or ".." in path.parts:
        raise Unknown("unexpected_path")
    parents = list(reversed(path.parents))
    signature = []
    for index, part in enumerate([*parents, path]):
        try:
            info = part.lstat()
        except OSError as exc:
            raise Unknown("unavailable_path") from exc
        if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & REPARSE_POINT:
            raise Unknown("redirected_path")
        is_leaf = index == len(parents)
        expected_dir = leaf_directory or not is_leaf
        if (expected_dir and not stat.S_ISDIR(info.st_mode)) or (
            not expected_dir and not stat.S_ISREG(info.st_mode)
        ):
            raise Unknown("unexpected_file_type")
        if not info.st_ino or not info.st_dev:
            raise Unknown("file_identity_unavailable")
        signature.append(_ident(info))
    return tuple(signature)


def _safe_read(path: Path):
    before = _inspect_path(path, leaf_directory=False)
    if before[-1][3] > MAX_READ:
        raise Unknown("oversized_input")
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOINHERIT", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
    try:
        fd = os.open(path, flags)
        with os.fdopen(fd, "rb") as stream:
            opened = _ident(os.fstat(stream.fileno()))
            data = stream.read(MAX_READ + 1)
            closed = _ident(os.fstat(stream.fileno()))
    except OSError as exc:
        raise Unknown("unreadable_input") from exc
    after = _inspect_path(path, leaf_directory=False)
    if before != after or opened != closed or opened[:5] != before[-1][:5]:
        raise Unknown("input_changed")
    if len(data) > MAX_READ or len(data) != before[-1][3]:
        raise Unknown("input_changed")
    return data


def _directory_entries(path: Path):
    before = _inspect_path(path, leaf_directory=True)
    try:
        entries = tuple(path.iterdir())
    except OSError as exc:
        raise Unknown("unreadable_input") from exc
    if _inspect_path(path, leaf_directory=True) != before:
        raise Unknown("input_changed")
    return entries


def _json_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise Unknown("duplicate_json_key")
        result[key] = value
    return result


def _runner_selection(raw, allowed):
    if hashlib.sha256(raw).hexdigest() not in allowed:
        raise Unknown("runner_not_reviewed")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeError as exc:
        raise Unknown("invalid_runner") from exc
    matches = RUNNER_PYTHON.findall(text)
    if len(matches) != 1:
        raise Unknown("unsupported_runner")
    return matches[0]


def _version_from_metadata(site: Path):
    matches = [entry for entry in _directory_entries(site)
               if re.fullmatch(r"mcp-.+\.dist-info", entry.name, flags=re.I)]
    if len(matches) != 1:
        raise Unknown("ambiguous_mcp_metadata")
    headers = BytesParser().parsebytes(_safe_read(matches[0] / "METADATA"), headersonly=True)
    names, versions = headers.get_all("Name", []), headers.get_all("Version", [])
    if len(names) != 1 or names[0].lower() != "mcp" or len(versions) != 1:
        raise Unknown("invalid_mcp_metadata")
    version = versions[0]
    if not VERSION.fullmatch(version) or matches[0].name.lower() != f"mcp-{version}.dist-info".lower():
        raise Unknown("invalid_mcp_metadata")
    return version


def _required_mcp(raw):
    try:
        data = tomllib.loads(raw.decode("utf-8"))
        project = data["project"]
        lists = [project.get("dependencies", [])]
        extras = project.get("optional-dependencies", {})
        if not isinstance(extras, dict):
            raise ValueError()
        lists.extend(extras.values())
        if any(not isinstance(values, list) or any(not isinstance(x, str) for x in values)
               for values in lists):
            raise ValueError()
    except (ValueError, KeyError, TypeError, UnicodeError, tomllib.TOMLDecodeError) as exc:
        raise Unknown("invalid_pyproject") from exc
    requirements = [item for values in lists for item in values
                    if re.match(r"(?i)^mcp(?:\s|[<>=!~;\[]|$)", item)]
    matches = [re.fullmatch(r"mcp==([A-Za-z0-9.!+_-]{1,64})", item, re.I)
               for item in requirements]
    if not matches or any(m is None for m in matches):
        raise Unknown("ambiguous_mcp_requirement")
    versions = {m.group(1) for m in matches}
    if len(versions) != 1:
        raise Unknown("ambiguous_mcp_requirement")
    return versions.pop()


def _parse_python(raw):
    try:
        return ast.parse(raw)
    except (SyntaxError, UnicodeError, ValueError, TypeError) as exc:
        raise Unknown("invalid_python_source") from exc


def _signature(raw):
    tree = _parse_python(raw)
    funcs = [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
             and node.name == "streamable_http_client"]
    if len(funcs) != 1:
        raise Unknown("ambiguous_mcp_signature")
    # Module-level assignments/imports could rebind the name after definition.
    # Reject such sources; this still cannot rule out decorators or monkeypatches.
    for node in tree.body:
        if node is funcs[0]:
            continue
        if isinstance(node, (ast.Assign, ast.AnnAssign, ast.AugAssign, ast.Import, ast.ImportFrom)):
            if any(isinstance(part, ast.Name) and part.id == "streamable_http_client"
                   for part in ast.walk(node)):
                raise Unknown("ambiguous_mcp_signature")
            if isinstance(node, (ast.Import, ast.ImportFrom)) and any(
                alias.name == "*" or (alias.asname or alias.name.split(".")[0]) == "streamable_http_client"
                for alias in node.names
            ):
                raise Unknown("ambiguous_mcp_signature")
    args = funcs[0].args
    keywords = [a.arg for a in (*args.args, *args.kwonlyargs)]
    return "present" if "max_sse_event_size" in keywords or args.kwarg else "absent"


def _host_call(raw):
    tree = _parse_python(raw)
    calls = [node for node in ast.walk(tree) if isinstance(node, ast.Call)
             and isinstance(node.func, ast.Attribute) and node.func.attr == "streamable_http_client"
             and isinstance(node.func.value, ast.Name) and node.func.value.id == "_core"]
    if len(calls) != 1 or any(kw.arg is None for kw in calls[0].keywords):
        raise Unknown("ambiguous_host_call")
    return "present" if any(k.arg == "max_sse_event_size" for k in calls[0].keywords) else "absent"


def _fact_venv(raw, expected_environment_root: Path):
    try:
        record = json.loads(raw.decode("utf-8-sig"), object_pairs_hook=_json_object)
        if type(record["schema"]) is not int or record["schema"] != 1:
            raise ValueError()
        value = record["packages"]["venv"]["environment"]
        if not isinstance(value, str):
            raise ValueError()
    except (ValueError, KeyError, TypeError, UnicodeError) as exc:
        raise Unknown("invalid_facts") from exc
    candidate = Path(value)
    if not candidate.is_absolute() or ".." in candidate.parts:
        raise Unknown("unexpected_facts_path")
    try:
        relative = candidate.relative_to(expected_environment_root)
    except ValueError as exc:
        raise Unknown("unexpected_facts_path") from exc
    if len(relative.parts) != 2 or not GENERATION.fullmatch(relative.parts[0]) or relative.parts[1] != "venv":
        raise Unknown("unexpected_facts_path")
    return candidate, relative.parts[0]


def diagnose(project: Path, hermes: Path, *, allowed_runners=TRUSTED_RUNNERS,
             allowed_mcp_sources=TRUSTED_MCP_SOURCES, allowed_host_sources=TRUSTED_HOST_SOURCES):
    """Read bounded inputs and return only sanitized, non-secret observations."""
    try:
        project, hermes = project.absolute(), hermes.absolute()
        _inspect_path(project, leaf_directory=True)
        _inspect_path(hermes, leaf_directory=True)
        agent = hermes / "hermes-agent"
        _inspect_path(agent, leaf_directory=True)
        key = hashlib.sha256(str(agent.resolve(strict=True)).encode("utf-8")).hexdigest()[:16]
        if not KEY.fullmatch(key):
            raise Unknown("unexpected_install_key")
        runner = _safe_read(project / "verification" / "run-local.ps1")
        runner_key, runner_generation = _runner_selection(runner, allowed_runners)
        if runner_key != key:
            raise Unknown("runner_install_key_mismatch")
        env_root = hermes / "installs" / key / "environments"
        _inspect_path(env_root, leaf_directory=True)
        fact_path = hermes / "installs" / key / "facts.json"
        facts = _safe_read(fact_path)
        selected, selected_generation = _fact_venv(facts, env_root)
        test_env = env_root / runner_generation / "venv"
        for env in (test_env, selected):
            _inspect_path(env, leaf_directory=True)
            _inspect_path(env / "Scripts" / "python.exe", leaf_directory=False)
            _safe_read(env / "pyvenv.cfg")
        site = test_env / "Lib" / "site-packages"
        version = _version_from_metadata(site)
        requirement = _required_mcp(_safe_read(agent / "pyproject.toml"))
        mcp_source = _safe_read(site / "mcp" / "client" / "streamable_http.py")
        host_source = _safe_read(agent / "tools" / "mcp_tool_transport.py")
        if hashlib.sha256(mcp_source).hexdigest() not in allowed_mcp_sources:
            raise Unknown("mcp_source_not_reviewed")
        if hashlib.sha256(host_source).hexdigest() not in allowed_host_sources:
            raise Unknown("host_source_not_reviewed")
        signature = _signature(mcp_source)
        host = _host_call(host_source)
        selection = "same" if selected_generation == runner_generation else "different"
        version_state = "same" if version == requirement else "different"
        static_conflict = host == "present" and signature == "absent"
        status = "static_mismatch" if selection == "different" or version_state == "different" or static_conflict else "no_detected_static_mismatch"
        return {"status": status, "runner_vs_recorded_selection": selection,
                "test_env_mcp_metadata_version": version, "inspected_tree_mcp_required_version": requirement,
                "declared_version_comparison": version_state,
                "inspected_tree_call_keyword": host, "test_env_source_keyword": signature,
                "static_source_keyword_difference": static_conflict, "diagnostic_only": True,
                "inspected_tree_gateway_binding_verified": False, "test_env_gateway_binding_verified": False,
                "runtime_binding_verified": False, "loaded_gateway_verified": False,
                "external_runtime_verified": False,
                "note": "Only hermes-agent source tree and test environment files were inspected; the gateway may import other files. Runtime binding, imports and loaded gateway are not verified."}
    except Unknown as exc:
        return {"status": "unknown", "reason": str(exc), "diagnostic_only": True,
                "inspected_tree_gateway_binding_verified": False, "test_env_gateway_binding_verified": False,
                "runtime_binding_verified": False, "loaded_gateway_verified": False, "external_runtime_verified": False}
    except (OSError, ValueError, TypeError, RuntimeError):
        return {"status": "unknown", "reason": "unavailable_or_invalid_input", "diagnostic_only": True,
                "inspected_tree_gateway_binding_verified": False, "test_env_gateway_binding_verified": False,
                "runtime_binding_verified": False, "loaded_gateway_verified": False, "external_runtime_verified": False}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, required=True)
    parser.add_argument("--hermes-root", type=Path, required=True)
    args = parser.parse_args(argv)
    result = diagnose(args.project, args.hermes_root)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return {"no_detected_static_mismatch": 0, "static_mismatch": 1, "unknown": 2}[result["status"]]


if __name__ == "__main__":
    sys.exit(main())
