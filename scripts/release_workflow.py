"""Build and test a ZIP in a separate preview; never install into live Hermes.

The release lock is cooperative. This helper does not establish an atomic
barrier against an unrelated editor or a newly starting Hermes task.
"""
from argparse import ArgumentParser
import ast
from datetime import datetime, timezone
from hashlib import sha256
import importlib.util
import io
import json
import math
import os
from pathlib import Path, PurePosixPath, PureWindowsPath
import re
import shutil
import stat
import subprocess
import sys
import time
from uuid import uuid4
from zipfile import BadZipFile, ZipFile


class WorkflowError(RuntimeError):
    pass


# These executable project inputs were reviewed for the isolated preview.
# Updating them requires a fresh review before adding another digest.
TRUSTED_EXECUTABLE_INPUTS = {
    'scripts/build.mjs': {'b697dc58f04c55fe34789e08ce864976c4575b1c89fe4db1eed1c731c44cc8cf'},
    'scripts/package.py': {'db0b8ca93924c1f5af9b37f207d2791b40322071ca8fa61de573a32b1def6edb',
                           '6a0a90da36ef8be7a0e4b8187c336610f5f4bc0669297f40a621d487635bd38a',
                            '24cde82483559794a3b835ca58f925d8a52127a00c7789e2441d7fc6becb73ef',
                            'ec916d3d818a545994c71685acfd380411ee3d1d0c95bc0d252ace76b8bbd9a2'},
    'scripts/release_lock.py': {'7f5417ebf7facec0d082680e389d450a603c8a9204a7a47daba34e5a69444b2e'},
    'verification/visual-assets.mjs': {'fbe8201137fdd38c659c9f12e897850e7d34eb7b8e808d7dd62adf16e8c08773',
                                        '42b70299e75765199018cb9670931e83239f79f005b88e48d14ac9dbf8919564',
                                        '03373024dc4a43e5e8db343e4fda456f0c5eaf0db0d7a8aeb7620eecec07822b'},
    # Machine-specific private test runtime: each change requires fresh review.
    'verification/run-local.ps1': {'85e466293312a7bfe5476032a5af0f065509f4afbf313ef656f39d6ea9c0c48f'},
    'scripts/test_runtime_guard.py': {'df91a2578d999f38d67c2a44db04057ca362d797c28b54d1787f527fde0d7a97'},
    'verification/test-runtime-pin.json': {'d30ede6b16216c081fc5be49896ab9eb4d184586937dfe5fc96ac10d67ff81d4',
                                            '48e89dd1ca85d72b2b714cc9a50f5e04d5cb13e9c3aadd6f63fb8c981578fa35'},
    'verification/audit_isolated_gateway.py': {'6f902df81ec4b910ef5c938ebc3f7dff061542053ed4021ff8854593ca353f47',
                                                'ca01bc17aa6afb469a9f87bf991edc8206e41820fa2a24a3aacbedbd3ec7df15'},
    'verification/isolated-routing.mjs': {'3e3a76d0f21ef03b6ec79f29eebfc163c76901069daff54eda4c8549db0112b3'},
    'verification/runtime-audit-mode.mjs': {'f3c5f5749a274b0ba7fa1d7a97806947bcf380ae8c05196d5c9678313251e38d'},
    # The current reviewed sidebar token update and the earlier reviewed snapshot.
    'source/codex-reference.js': {'9985311c8204c4a42c27a9875a7d7754fddaf32e2c1e7753a901d148ae64d1fb',
                                  '00e0887642a131338e1c0465d9728cd7846948b5142d5d40ad4fffb03e8924e5'},
    'source/agent-avatars.js': {'ff00174d480e8157e57774bfd02f7faa96448c563d5efded761b8f541232a9d3'},
}
RESERVED_VISUAL_PATHS = {'HERMES_VISUAL_TIMELINE_PACKAGE', 'HERMES_VISUAL_ACTIVITY_PACKAGE',
                         'HERMES_VISUAL_FIXTURE_PLUGIN', 'HERMES_VISUAL_REPLACEMENT_PLUGIN',
                         'HERMES_VISUAL_APPROVAL_REPLACEMENT'}
VISUAL_RUNNER_OWNED = {'HERMES_VISUAL_DESKTOP', 'HERMES_VISUAL_FIXTURE_DESKTOP', 'HERMES_VISUAL_ELECTRON',
                       'HERMES_VISUAL_PYTHON', 'HERMES_VISUAL_MODE', 'HERMES_VISUAL_FOCUS',
                       'HERMES_VISUAL_EVIDENCE_VERSION', 'HERMES_VISUAL_GPU', 'HERMES_VISUAL_PERF_HOTSPOTS'}
VISUAL_ALLOWED_FLAGS = {'HERMES_VISUAL_TYPOGRAPHY': {'verify'}, 'HERMES_VISUAL_TIMELINE_PARITY': {'1'}}


def digest(data):
    return sha256(data).hexdigest()


def plain(path):
    path = Path(os.path.abspath(path))
    for entry in (path, *path.parents):
        try:
            info = entry.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0):
            raise WorkflowError('Link or junction refused: ' + str(entry))
    return path


def regular(path, *, missing=False):
    path = plain(path)
    try:
        info = path.lstat()
    except FileNotFoundError:
        if missing:
            return None
        raise WorkflowError('Missing file: ' + str(path)) from None
    if not stat.S_ISREG(info.st_mode):
        raise WorkflowError('Not a regular file: ' + str(path))
    return path.read_bytes()


def put_new(path, data):
    path = plain(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    plain(path)
    with path.open('xb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def write_json(path, value):
    path = plain(path)
    pending = path.with_name(path.name + '.' + uuid4().hex + '.tmp')
    put_new(pending, (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
    os.replace(pending, path)


def read_json(path):
    try:
        return json.loads(regular(path).decode('utf-8'))
    except (UnicodeError, ValueError) as error:
        raise WorkflowError('Invalid JSON: ' + str(path)) from error


def lock_module(root):
    path = plain(root / 'scripts/release_lock.py')
    if digest(regular(path)) not in TRUSTED_EXECUTABLE_INPUTS['scripts/release_lock.py']:
        raise WorkflowError('Coordination tool changed; review it before updating trusted hashes')
    spec = importlib.util.spec_from_file_location('hcv_release_lock', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def require(root, owner):
    if not owner:
        raise WorkflowError('HCV_RELEASE_OWNER is required')
    lock_module(root).require_owner(root, owner)


def safe_name(name):
    if not isinstance(name, str) or not name or '\\' in name or ':' in name or '\0' in name:
        raise WorkflowError('Unsafe package path: ' + repr(name))
    path = PurePosixPath(name)
    reserved = re.compile(r'(?i)(con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:[ .].*)?\Z')
    if (path.is_absolute() or path.as_posix() != name
            or any(part in ('', '.', '..') or part[0].isspace() or part.endswith(('.', ' '))
                   or reserved.fullmatch(part) or PureWindowsPath(part).is_reserved()
                   or any(c in '*?"<>|' for c in part) for part in path.parts)):
        raise WorkflowError('Unsafe package path: ' + repr(name))
    if any(any(ord(c) < 32 for c in part) for part in path.parts):
        raise WorkflowError('Control character in package path')
    return name


def focus_names(spec):
    source = regular(spec).decode('utf-8')
    names = set(re.findall(r"HERMES_VISUAL_FOCUS\s*===\s*['\"]([a-z0-9-]+)['\"]", source))
    array = r"\[((?:\s*['\"][a-z0-9-]+['\"]\s*,?)+)\]\.includes\(process\.env\.HERMES_VISUAL_FOCUS\)"
    for match in re.finditer(array, source):
        names.update(re.findall(r"['\"]([a-z0-9-]+)['\"]", match.group(1)))
    if not names:
        raise WorkflowError('Cannot identify scenario names in sandbox.spec.mjs')
    return names


def unique_focus(root, requested):
    names = focus_names(root / 'verification/sandbox.spec.mjs')
    result = list(dict.fromkeys(requested))
    if not result:
        raise WorkflowError('At least one Focus is required')
    for name in result:
        if name not in names:
            raise WorkflowError('Unknown Focus: ' + name)
    return result


BRANCH_JSON = {
    'activity-center': 'activity-center.json',
    'usage': 'usage.json',
    'turn-diff': 'saved-main.json',
    'file-links': 'file-links.json',
    'draft-setup': 'draft-setup.json',
    'agent-lifecycle': 'agent-lifecycle.json',
    'activity-bundles': 'activity-bundles.json',
    'activity-parity': 'activity-parity.json',
    'new-chat-welcome': 'new-chat-welcome.json',
    'session-navigation': 'session-navigation.json',
    'command-palette': 'command-palette.json',
    'zoom-banner': 'zoom-banner.json',
    'workspace-summary-live': 'workspace-summary-live.json',
    'sidebar-more': 'sidebar-more.json',
    'sidebar-more-all': 'sidebar-more.json',
}
BRANCH_IMAGES = {
    'sidebar': ('sidebar-project-menu.png', 'sidebar-project-menu-highlight.png'),
    'sidebar-activity': ('thinking-without-timer.png', 'sidebar-working-project.png'),
    'mcp-page': ('mcp-directory.png', 'mcp-tools.png'),
    'window-menu': ('window-menu-workspace-dark-top.png', 'window-menu-workspace-dark-bottom.png',
                    'window-menu-workspace-light-top.png', 'window-menu-workspace-light-bottom.png'),
}


def branch_backend_hash(focus, members):
    name = {'activity-center': 'activity.py', 'turn-diff': 'turn_changes.py',
            'workspace-summary-live': 'turn_changes.py'}.get(focus)
    return digest(members[name]) if name in members else None


def branch_evidence(root, focus, evidence_version, module_hash, backend_hash):
    """Confirm known scenario-specific output, not just a generic test exit."""
    if not re.fullmatch(r'release-[0-9a-f]{32}-[0-9]+', evidence_version):
        raise WorkflowError('Invalid scenario evidence identifier')
    folder = root / 'evidence'
    if focus in BRANCH_JSON:
        path = folder / (evidence_version + '-' + BRANCH_JSON[focus])
        value = read_json(path)
        if not isinstance(value, dict) or value.get('moduleSha256') != module_hash:
            raise WorkflowError('Scenario-specific evidence has the wrong module: ' + focus)
        if focus == 'activity-center' and (value.get('backendSha256') != backend_hash or value.get('failureUi') is not True):
            raise WorkflowError('Activity scenario did not verify the same ZIP backend and failure UI')
        if focus == 'turn-diff':
            outlines = [value.get(key) for key in ('singleOutline', 'multiOutline', 'lightOutline')]
            if (backend_hash is None or value.get('backendSha256') != backend_hash
                    or not all(value.get(key) is True for key in ('actualUndoReapply', 'standalonePreviewsHidden'))
                    or not all(isinstance(outline, dict) and outline.get('after') == 'none' for outline in outlines)):
                raise WorkflowError('Saved change cards did not verify the same ZIP backend, outline and hidden previews')
        if focus == 'file-links' and not all(value.get(key) is True for key in (
                'filePreviewByMouseAndKeyboard', 'standalonePreviewsHidden', 'summarySource', 'themeAndForcedColors')):
            raise WorkflowError('File links did not verify inline actions, hidden cards and Results')
        if focus == 'draft-setup':
            draft = value.get('draftConsent')
            def matching_edges(state):
                if not isinstance(state, dict) or state.get('radii') != ['22px', '0px', '0px']:
                    return False
                bar, card = state.get('bar'), state.get('card')
                if not isinstance(bar, dict) or not isinstance(card, dict):
                    return False
                coordinates = (bar.get('left'), bar.get('right'), card.get('left'), card.get('right'))
                if not all(type(number) in (int, float) and math.isfinite(number) for number in coordinates):
                    return False
                return (abs(coordinates[0] - coordinates[2]) < 1 and abs(coordinates[1] - coordinates[3]) < 1
                        and state.get('fits') is True and state.get('barButtonsAccessible') is True)
            if (not isinstance(draft, dict) or draft.get('baseline') is not False
                    or not all(matching_edges(draft.get(key)) for key in ('dark', 'withProject', 'narrow', 'light'))
                    or value.get('normalSetup') is not True):
                raise WorkflowError('Draft setup scenario did not verify the complete consent and setup states')
        if focus in ('sidebar-more', 'sidebar-more-all'):
            scope = 'all-profiles' if focus == 'sidebar-more-all' else 'profile'
            if value.get('scope') != scope or value.get('inline') is not True or value.get('legacyHidden') is not True:
                raise WorkflowError('Project sidebar scenario did not verify inline expansion: ' + focus)
        if focus == 'workspace-summary-live':
            presentation = value.get('presentation')
            if (backend_hash is None or value.get('backendSha256') != backend_hash
                    or not all(value.get(key) is True for key in ('branchTotals', 'reopenedReview', 'nestedNewFiles'))
                    or not isinstance(presentation, dict)
                    or not all(presentation.get(key) is True for key in
                               ('sidebar', 'model', 'dictation', 'reducedMotion', 'newTurnDefault', 'dashPresentation'))):
                raise WorkflowError('Workspace summary did not verify the same ZIP backend and all requested states')
        name = path.relative_to(root).as_posix()
        return {'confirmed': True, 'evidence_version': evidence_version,
                'files': {name: digest(regular(path))}}
    if focus in BRANCH_IMAGES:
        paths = [folder / (evidence_version + '-' + name) for name in BRANCH_IMAGES[focus]]
        for path in paths:
            data = regular(path)
            if len(data) <= 8 or not data.startswith(b'\x89PNG\r\n\x1a\n'):
                raise WorkflowError('Scenario-specific screenshot is missing or invalid: ' + focus)
        return {'confirmed': True, 'evidence_version': evidence_version,
                'files': {path.relative_to(root).as_posix(): digest(regular(path)) for path in paths}}
    return {'confirmed': False, 'evidence_version': evidence_version, 'files': {},
            'note': 'No automatic branch evidence is registered for this Focus.'}


def _eval(node, env):
    """Interpret only the declarative subset used by package.py; never exec it."""
    if isinstance(node, ast.Constant) and isinstance(node.value, (str, bool)):
        return node.value
    if isinstance(node, ast.Name) and node.id in env:
        return env[node.id]
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div):
        left, right = _eval(node.left, env), _eval(node.right, env)
        if not isinstance(left, Path) or not isinstance(right, str):
            raise WorkflowError('Unexpected package path expression')
        return left / right
    if isinstance(node, ast.JoinedStr):
        parts = []
        for value in node.values:
            if isinstance(value, ast.Constant) and isinstance(value.value, str):
                parts.append(value.value)
            elif isinstance(value, ast.FormattedValue) and value.conversion == -1 and value.format_spec is None:
                part = _eval(value.value, env)
                if not isinstance(part, str):
                    raise WorkflowError('Unexpected formatted package name')
                parts.append(part)
            else:
                raise WorkflowError('Unexpected formatted package expression')
        return ''.join(parts)
    if isinstance(node, ast.Dict):
        result = {}
        for key, value in zip(node.keys, node.values):
            subset = _eval(value, env) if key is None else {_eval(key, env): _eval(value, env)}
            if not isinstance(subset, dict) or result.keys() & subset.keys():
                raise WorkflowError('Duplicate or unexpected package declaration')
            result.update(subset)
        return result
    if isinstance(node, ast.DictComp) and len(node.generators) == 1:
        generator = node.generators[0]
        if not isinstance(generator.target, ast.Name) or generator.ifs or generator.is_async or not isinstance(generator.iter, (ast.Tuple, ast.List)):
            raise WorkflowError('Unsupported package comprehension')
        result = {}
        for item in generator.iter.elts:
            val = _eval(item, env)
            if not isinstance(val, str):
                raise WorkflowError('Unsupported package comprehension value')
            nested = dict(env, **{generator.target.id: val})
            key = _eval(node.key, nested)
            if key in result:
                raise WorkflowError('Duplicate package member')
            result[key] = _eval(node.value, nested)
        return result
    raise WorkflowError('Unsupported package declaration: ' + type(node).__name__)


def declared_files(root, manifest):
    source = regular(root / 'scripts/package.py').decode('utf-8')
    tree = ast.parse(source)
    env = {'root': root, 'backend': root / 'source/usage-backend', 'module': root / '.local/plugin.js'}
    files, agents, seen_base = {}, set(), False
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'files' for t in node.targets):
            if seen_base:
                raise WorkflowError('Ambiguous package declaration')
            files = _eval(node.value, env)
            seen_base = True
        if not isinstance(node, ast.If):
            continue
        updates = [child for child in node.body if isinstance(child, ast.Expr) and isinstance(child.value, ast.Call)
                   and isinstance(child.value.func, ast.Attribute) and isinstance(child.value.func.value, ast.Name)
                   and child.value.func.value.id == 'files' and child.value.func.attr == 'update']
        if not updates:
            continue
        test = node.test
        if not (len(updates) == len(node.body) == 1 and isinstance(test, ast.Compare) and len(test.ops) == 1
                and isinstance(test.ops[0], ast.Is) and len(test.comparators) == 1
                and isinstance(test.comparators[0], ast.Constant) and test.comparators[0].value is True
                and isinstance(test.left, ast.Call) and isinstance(test.left.func, ast.Attribute)
                and isinstance(test.left.func.value, ast.Name) and test.left.func.value.id == 'manifest'
                and test.left.func.attr == 'get' and len(test.left.args) == 1
                and isinstance(test.left.args[0], ast.Constant) and isinstance(test.left.args[0].value, str)):
            raise WorkflowError('Unsupported conditional package declaration')
        flag = test.left.args[0].value
        call = updates[0].value
        if len(call.args) != 1 or call.keywords:
            raise WorkflowError('Unsupported package update')
        if manifest.get(flag) is True:
            add = _eval(call.args[0], env)
            if not isinstance(add, dict) or files.keys() & add.keys():
                raise WorkflowError('Duplicate or unexpected package member')
            files.update(add)
            if flag == 'hermesAgentPackage':
                agents.update(add)
    if not seen_base or 'plugin.js' not in files or (manifest.get('hermesAgentPackage') is True and not agents):
        raise WorkflowError('Missing package declaration')
    seen = set()
    for name, source_path in files.items():
        safe_name(name)
        if name.casefold() in seen or not isinstance(source_path, Path):
            raise WorkflowError('Duplicate or invalid package member')
        seen.add(name.casefold())
        if not Path(os.path.abspath(source_path)).is_relative_to(root):
            raise WorkflowError('Package input outside workspace: ' + name)
        plain(source_path)
    for name in agents:
        if files[name] != root / 'source/usage-backend' / Path(*PurePosixPath(name).parts):
            raise WorkflowError('Agent member does not match declared backend path: ' + name)
    if agents and not {'plugin.yaml', '__init__.py'} <= agents:
        raise WorkflowError('Incomplete agent declaration')
    return files, agents


def read_archive(root, archive, expected_hash=None, *, installed_agent_version=None):
    manifest = read_json(root / 'package.json')
    if manifest.get('name') != 'hermes-codex-visual' or not re.fullmatch(r'[0-9]+(?:\.[0-9]+){2}(?:[-+][A-Za-z0-9.-]+)?', manifest.get('version', '')):
        raise WorkflowError('Invalid project name or version')
    files, agents = declared_files(root, manifest)
    raw = regular(archive)
    archive_hash = digest(raw)
    if expected_hash is not None and archive_hash != expected_hash:
        raise WorkflowError('ZIP SHA-256 changed')
    values = {}
    try:
        with ZipFile(io.BytesIO(raw)) as package:
            seen = set()
            total = 0
            for info in package.infolist():
                name = safe_name(info.filename)
                mode = info.external_attr >> 16
                if info.is_dir() or stat.S_IFMT(mode) not in (0, stat.S_IFREG) or name.casefold() in seen:
                    raise WorkflowError('Directory, link or duplicate in ZIP: ' + name)
                seen.add(name.casefold())
                total += info.file_size
                if info.file_size > 50_000_000 or total > 150_000_000:
                    raise WorkflowError('ZIP is too large')
                values[name] = package.read(info)
    except (BadZipFile, EOFError, RuntimeError) as error:
        raise WorkflowError('Invalid ZIP: ' + str(error)) from error
    prefix = manifest['name'] + '/'
    expected = {prefix + name for name in files}
    if set(values) != expected:
        raise WorkflowError('ZIP content differs from package declaration')
    for name, source_path in files.items():
        if values[prefix + name] != regular(source_path):
            raise WorkflowError('ZIP differs from declared input: ' + name)
    if agents:
        text = values[prefix + 'plugin.yaml'].decode('utf-8')
        lines = [line for line in text.splitlines() if re.match(r'^version\s*:', line)]
        if len(lines) != 1:
            raise WorkflowError('Agent plugin version is missing or ambiguous')
        match = re.fullmatch(r'''version\s*:\s*(?:([0-9A-Za-z.+-]+)|"([0-9A-Za-z.+-]+)"|'([0-9A-Za-z.+-]+)')\s*(?:#.*)?''', lines[0])
        version = next((value for value in match.groups() if value is not None), None) if match else None
        expected_agent = installed_agent_version if installed_agent_version is not None else manifest['version']
        if version != expected_agent:
            raise WorkflowError('Agent and desktop version differ')
    return manifest, {name: values[prefix + name] for name in files}, agents, archive_hash


def snapshot(root):
    files = {}
    for folder in ('source', 'verification'):
        base = plain(root / folder)
        if not base.is_dir():
            raise WorkflowError('Missing input directory: ' + str(base))
        for path in sorted(base.rglob('*')):
            if '__pycache__' in path.parts:
                continue
            plain(path)
            if path.is_file():
                files[path.relative_to(root).as_posix()] = digest(regular(path))
    for name in ('package.json', 'package-lock.json', 'scripts/package.py', 'scripts/build.mjs', 'scripts/release_lock.py'):
        files[name] = digest(regular(root / name))
    return files


def project_inputs(root):
    """Fingerprint the complete project-owned input set, excluding test debris.

    These fingerprints do not include external Hermes, Python or Node packages.
    """
    root = plain(root)
    result = {}
    for name in ('source', 'verification', 'scripts'):
        start = plain(root / name)
        if not start.is_dir():
            raise WorkflowError('Missing input directory: ' + str(start))
        for directory, dirs, files in os.walk(start, topdown=True, followlinks=False):
            folder = plain(Path(directory))
            kept = []
            for dirname in dirs:
                item = plain(folder / dirname)
                relative = item.relative_to(root)
                ignored = dirname in ('__pycache__', '.pytest_cache', '.pytest-cache')
                if name == 'verification' and len(relative.parts) == 2:
                    ignored = ignored or dirname.startswith(('synthetic-', 'capture-'))
                if not ignored:
                    kept.append(dirname)
            dirs[:] = sorted(kept)
            for filename in sorted(files):
                if filename.endswith(('.pyc', '.pyo')):
                    continue
                path = plain(folder / filename)
                relative = path.relative_to(root).as_posix()
                info = path.lstat()
                if not stat.S_ISREG(info.st_mode):
                    raise WorkflowError('Unsafe project input: ' + str(path))
                data = regular(path)
                after = path.lstat()
                if (info.st_size, info.st_mtime_ns, info.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
                    raise WorkflowError('Project input changed during read: ' + relative)
                result[relative] = digest(data)
    for name in ('package.json', 'package-lock.json', 'LICENSE', 'THIRD_PARTY_NOTICES.txt'):
        result[name] = digest(regular(root / name))
    return dict(sorted(result.items()))


def input_changes(expected, actual):
    return sorted(name for name in expected.keys() | actual.keys() if expected.get(name) != actual.get(name))


def inputs_hash(inputs):
    return digest(json.dumps(inputs, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))


def inspect_inputs(project, out):
    """Save a reviewable input manifest without executing project code."""
    project, out = plain(project), plain(out)
    if not out.is_relative_to(project / '.local') or out == project / '.local':
        raise WorkflowError('Input manifest must be under this project .local')
    inputs = project_inputs(project)
    trusted_project_inputs(inputs, read_json(project / 'package.json'))
    value = {'schema': 1, 'project': str(project), 'inputs_sha256': inputs_hash(inputs), 'inputs': inputs,
             'note': 'Review test and plugin changes before using this digest; no project code was executed.'}
    put_new(out, (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
    return {'manifest': str(out), 'inputs_sha256': value['inputs_sha256'], 'file_count': len(inputs)}


def test_flag_hashes(environment):
    return {key: digest(value.encode('utf-8')) for key, value in sorted(environment.items())
            if key in VISUAL_ALLOWED_FLAGS and value not in ('', '0', 'false')}


def pinned_test_runtime(root):
    """Read the reviewed project input, not a caller-supplied Python path."""
    pin = read_json(root / 'verification/test-runtime-pin.json')
    if (not isinstance(pin, dict) or set(pin) != {'schema', 'runtime_id', 'manifest_sha256', 'tree_sha256'}
            or type(pin['schema']) is not int or pin['schema'] != 1
            or not isinstance(pin['runtime_id'], str) or not re.fullmatch(r'[0-9a-f]{32}', pin['runtime_id'])
            or any(not isinstance(pin[k], str) or not re.fullmatch(r'[0-9a-f]{64}', pin[k])
                   for k in ('manifest_sha256', 'tree_sha256'))):
        raise WorkflowError('Invalid reviewed private runtime pin')
    return {key:pin[key] for key in ('runtime_id', 'manifest_sha256', 'tree_sha256')}


def check_test_runtime(root):
    """Recheck current private runtime bytes, without executing that Python."""
    path = plain(root / 'scripts/test_runtime_guard.py')
    if digest(regular(path)) not in TRUSTED_EXECUTABLE_INPUTS['scripts/test_runtime_guard.py']:
        raise WorkflowError('Private runtime guard changed; review it before use')
    try:
        spec = importlib.util.spec_from_file_location('hcv_private_runtime_guard', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        store, base = module.local_paths()
        result = module.verify_runtime(root, store, base)
        return {key:result[key] for key in ('runtime_id', 'manifest_sha256', 'tree_sha256')}
    except (OSError, ValueError, TypeError, RuntimeError) as error:
        raise WorkflowError('Private test runtime could not be verified: ' + str(error)) from error


def check_gateway_audit(output, *, require_mcp=True):
    """Check the test's own PID; optionally check initial profile MCP exchanges."""
    matches = re.findall(r'(?m)^HCV_ISOLATED_GATEWAY_AUDIT (\{[^\r\n]*\})\r?$', output)
    if len(matches) != 1:
        raise WorkflowError('Isolated gateway audit is missing or ambiguous')
    try:
        value = json.loads(matches[0])
    except (ValueError, TypeError) as error:
        raise WorkflowError('Isolated gateway audit is malformed') from error
    if (not isinstance(value, dict) or any(value.get(k) is not True for k in
            ('isolated_home', 'expected_command_python', 'expected_base_exe', 'hermes_entry_path_verified',
             'private_gateway_rendezvous'))
            or any(type(value.get(k)) is not int or value[k] <= 0 for k in ('pid', 'start_time'))
            or value.get('loaded_module_paths_verified') is not False
            or value.get('continuous_mcp_connection_verified') is not False):
        raise WorkflowError('Isolated gateway audit is incomplete')
    if require_mcp:
        if (value.get('named_mcp_initial_registration') is not True
                or any(type(value.get(k)) is not int or value[k] < 2 for k in
                       ('initial_mcp_initialize_count', 'initial_mcp_tools_count'))):
            raise WorkflowError('Initial profile MCP registrations are incomplete')
    elif value.get('named_mcp_initial_registration') is not None:
        raise WorkflowError('Unexpected MCP registration claim')
    return value


def trusted_project_inputs(inputs, manifest):
    for name, allowed in TRUSTED_EXECUTABLE_INPUTS.items():
        if inputs.get(name) not in allowed:
            raise WorkflowError('Executable input changed; review before updating the trusted hash: ' + name)
    scripts = manifest.get('scripts')
    if (not isinstance(scripts, dict)
            or scripts.get('build') != 'node scripts/build.mjs'
            or scripts.get('check') != 'node scripts/build.mjs --check && node --check plugin.js'
            or any(name in scripts for name in ('prebuild', 'postbuild', 'precheck', 'postcheck'))):
        raise WorkflowError('Unreviewed npm command or lifecycle hook refused')
    for key, value in os.environ.items():
        if not key.startswith('HERMES_VISUAL_') or key in RESERVED_VISUAL_PATHS or key in VISUAL_RUNNER_OWNED:
            continue
        if value not in ('', '0', 'false') and value not in VISUAL_ALLOWED_FLAGS.get(key, set()):
            raise WorkflowError('Baseline, partial or unreviewed visual test mode refused: ' + key)


def verify_snapshot(project, workspace, inputs):
    actual = project_inputs(workspace)
    changed = input_changes(inputs, actual)
    if changed:
        raise WorkflowError('Preview inputs changed: ' + ', '.join(changed[:15]))
    return not input_changes(inputs, project_inputs(project))


def preview(project, out, focuses, reviewed_inputs_sha256, *, runner=None, tools=None):
    """Build and test a unique, separate copy of inputs under .local.

    Never writes shared build outputs or the working Hermes installation.
    """
    project = plain(project)
    unique_focus(project, focuses)
    inputs = project_inputs(project)
    trusted_project_inputs(inputs, read_json(project / 'package.json'))
    if not re.fullmatch(r'[0-9a-f]{64}', reviewed_inputs_sha256 or '') or inputs_hash(inputs) != reviewed_inputs_sha256:
        raise WorkflowError('Review the current input manifest and pass its exact SHA-256 before preview')
    out = make_run_dir(project, out)
    workspace = out / 'workspace'
    workspace.mkdir(exist_ok=False)
    try:
        for name, expected in inputs.items():
            source = project.joinpath(*PurePosixPath(name).parts)
            data = regular(source)
            if digest(data) != expected:
                raise WorkflowError('Project input changed during snapshot: ' + name)
            put_new(workspace.joinpath(*PurePosixPath(name).parts), data)
        current = project_inputs(project)
        changed = input_changes(inputs, current)
        if changed:
            raise WorkflowError('Project inputs changed during snapshot: ' + ', '.join(changed[:15]))
        if project_inputs(workspace) != inputs:
            raise WorkflowError('Copied inputs do not match the project')
        (workspace / '.local').mkdir()
        put_new(workspace / '.local' / 'preview-identity.json',
                (json.dumps({'schema': 1, 'project': str(project), 'workspace': str(workspace)},
                            ensure_ascii=False) + '\n').encode('utf-8'))
        preview_owner = 'preview-' + uuid4().hex
        lock = lock_module(workspace)
        lock.change(workspace, 'acquire', preview_owner, task='isolated preview only')
        manifest = {'schema': 1, 'kind': 'isolated-preview', 'project': str(project),
                    'workspace': str(workspace), 'inputs': inputs,
                    'note': 'Preview only. Project outputs and installed Hermes were not changed. '
                            'This is not an OS security sandbox; scenario code must be trusted.'}
        write_json(out / 'preview.json', manifest)
        if runner is None:
            runner = command
        result = build_and_check(workspace, preview_owner, workspace / '.local' / 'run', focuses, True,
                                 runner=runner, tools=tools)
        if not verify_snapshot(project, workspace, inputs):
            result['project_changed_during_preview'] = True
        else:
            result['project_changed_during_preview'] = False
        lock.change(workspace, 'release', preview_owner, note='isolated preview complete')
        manifest.update(status=result['status'], archive_sha256=result['archive_sha256'],
                        module_sha256=result['module_sha256'], checks=result['focus_requested'],
                        branch_evidence=result['branch_evidence'], test_runtime=result['test_runtime'],
                        project_changed_during_preview=result['project_changed_during_preview'],
                        runtime_note='External Hermes, Python and Node dependencies are not fully fingerprinted.')
        write_json(out / 'preview.json', manifest)
        return {key: manifest[key] for key in ('status', 'workspace', 'archive_sha256', 'module_sha256',
                                                'checks', 'project_changed_during_preview', 'runtime_note')}
    except BaseException as error:
        # Never delete the isolated candidate: it may be needed to diagnose a failure.
        failure = {'schema': 1, 'kind': 'isolated-preview', 'project': str(project),
                   'workspace': str(workspace), 'status': 'stopped', 'error': str(error)}
        write_json(out / 'preview-failed.json', failure)
        raise


def check_promotion(project, out, owner, archive=None, *, timing_sink=None):
    """Check evidence and current project inputs; does not write a release."""
    project = plain(project)
    require(project, owner)
    out = plain(out)
    local = plain(project / '.local')
    if not out.is_relative_to(local) or out == local:
        raise WorkflowError('Preview must be under this project .local')
    manifest = read_json(out / 'preview.json')
    workspace = plain(out / 'workspace')
    if (manifest.get('schema') != 1 or manifest.get('kind') != 'isolated-preview'
            or manifest.get('project') != str(project) or manifest.get('workspace') != str(workspace)
            or manifest.get('status') != 'selected_scenarios_passed'):
        raise WorkflowError('Preview evidence is missing or not complete')
    inputs = manifest.get('inputs')
    if not isinstance(inputs, dict) or not inputs:
        raise WorkflowError('Preview input manifest is missing')
    current = project_inputs(project)
    changes = input_changes(inputs, current)
    if changes:
        raise WorkflowError('Project inputs changed after preview: ' + ', '.join(changes[:15]))
    trusted_project_inputs(current, read_json(project / 'package.json'))
    if not verify_snapshot(project, workspace, inputs):
        raise WorkflowError('Project inputs changed during promotion check')
    run_dir = workspace / '.local' / 'run'
    receipt = read_json(run_dir / 'run.json')
    if (receipt.get('status') != 'selected_scenarios_passed'
            or receipt.get('archive_sha256') != manifest.get('archive_sha256')
            or receipt.get('module_sha256') != manifest.get('module_sha256')
            or receipt.get('focus_requested') != manifest.get('checks')
            or receipt.get('branch_evidence') != manifest.get('branch_evidence')
            or receipt.get('test_runtime') != manifest.get('test_runtime')):
        raise WorkflowError('Preview receipt does not match the candidate')
    runtime_check_start = time.monotonic()
    checked_runtime = check_test_runtime(workspace)
    runtime_check_seconds = round(time.monotonic() - runtime_check_start, 3)
    if (receipt.get('test_runtime') != pinned_test_runtime(project)
            or receipt.get('test_runtime') != checked_runtime):
        raise WorkflowError('Private test runtime changed since the preview')
    if receipt.get('inherited_test_flags_sha256') != test_flag_hashes(os.environ):
        raise WorkflowError('Test environment flags changed since the preview')
    zip_path = workspace / 'dist' / Path(receipt.get('archive', '')).name
    package_manifest, members, _, zip_hash = read_archive(workspace, zip_path, manifest.get('archive_sha256'))
    if digest(members['plugin.js']) != manifest.get('module_sha256'):
        raise WorkflowError('Preview module does not match its receipt')
    extracted = run_dir / 'package' / package_manifest['name']
    for name, data in members.items():
        if regular(extracted.joinpath(*PurePosixPath(name).parts)) != data:
            raise WorkflowError('Extracted test file changed since preview: ' + name)
    steps = receipt.get('steps')
    expected_steps = ['build-public', 'check-public', 'build-local', 'check-local', 'visual-assets', 'package']
    expected_steps += ['focus-' + focus for focus in manifest['checks']]
    if not isinstance(steps, list) or len(steps) != len(expected_steps):
        raise WorkflowError('Preview step log is incomplete')
    for index, (step, name) in enumerate(zip(steps, expected_steps)):
        if (not isinstance(step, dict) or step.get('name') != name or step.get('exit_code') != 0
                or step.get('log') != f'logs/{index + 1:02d}-{name}.log'
                or not re.fullmatch(r'[0-9a-f]{64}', step.get('log_sha256', ''))):
            raise WorkflowError('Invalid preview step log: ' + name)
        log = regular(run_dir.joinpath(*PurePosixPath(step['log']).parts))
        if digest(log) != step['log_sha256']:
            raise WorkflowError('Preview step log changed: ' + name)
        if name.startswith('focus-'):
            if not re.search(rb'Fixture module SHA-256\s+' + manifest['module_sha256'].encode('ascii') + rb'\b', log, re.IGNORECASE):
                raise WorkflowError('Scenario log no longer identifies the tested module: ' + name)
            runtime = receipt['test_runtime']
            expected_line = ('HCV_PRIVATE_RUNTIME ' + runtime['runtime_id'] + ' ' +
                             runtime['manifest_sha256'] + ' ' + runtime['tree_sha256']).encode('ascii')
            if len(re.findall(rb'(?m)^' + re.escape(expected_line) + rb'\r?$', log)) != 1:
                raise WorkflowError('Scenario log no longer identifies the tested runtime: ' + name)
            check_gateway_audit(log.decode('utf-8'), require_mcp=name == 'focus-sidebar-activity')
    for focus in manifest['checks']:
        record = receipt['branch_evidence'].get(focus)
        if not isinstance(record, dict) or record.get('confirmed') is not True:
            raise WorkflowError('Scenario branch was not confirmed: ' + focus)
        fresh = branch_evidence(workspace, focus, record.get('evidence_version', ''), manifest['module_sha256'],
                                branch_backend_hash(focus, members))
        if fresh != record:
            raise WorkflowError('Scenario evidence changed since preview: ' + focus)
    result = {'project_inputs_match': True, 'preview_zip_sha256': zip_hash, 'test_runtime': receipt['test_runtime'],
              'checks': manifest['checks'], 'installed': False, 'loaded': False,
              'external_runtime_verified': False,
              'note': 'Owner must review test coverage and external Hermes/runtime stability; no release or install performed.'}
    if archive is not None:
        archive = plain(archive)
        expected = project / 'dist' / zip_path.name
        if archive != expected:
            raise WorkflowError('Pass the matching release ZIP in this project dist')
        _, _, _, official_hash = read_archive(project, archive, zip_hash)
        result['release_zip_matches'] = official_hash == zip_hash
    if input_changes(inputs, project_inputs(project)):
        raise WorkflowError('Project inputs changed during promotion check')
    require(project, owner)
    if timing_sink is not None:
        timing_sink(runtime_check_seconds)
    return result


def file_identity(path):
    info = plain(path).lstat()
    if not stat.S_ISREG(info.st_mode) or not info.st_ino:
        raise WorkflowError('Cannot verify regular file identity: ' + str(path))
    return (info.st_dev, info.st_ino)


def installed_file_snapshot(path, expected):
    """Read one regular file and capture its identity; never write the target.

    Missing and inaccessible are different: only ENOENT is a missing file.
    Repeated checks reduce accidental races; they are not an OS-wide lock.
    """
    path = plain(path)
    try:
        before = path.lstat()
    except FileNotFoundError:
        # Recheck parents and absence to avoid treating an obvious transition as missing.
        path = plain(path)
        try:
            path.lstat()
        except FileNotFoundError:
            return None
        raise WorkflowError('Installed file appeared during inspection: ' + str(path))

    def signature(info):
        if not stat.S_ISREG(info.st_mode) or not info.st_dev or not info.st_ino:
            raise WorkflowError('Cannot verify regular installed file identity: ' + str(path))
        return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns)

    initial = signature(before)
    # Windows Python may report different st_ctime for path lstat and fd fstat.
    # Compare creation/change time path-to-path, and fd identity via the other fields.
    path_initial = (*initial, before.st_ctime_ns)
    if before.st_size > 50_000_000:
        raise WorkflowError('Installed file exceeds inspection limit: ' + str(path))
    flags = os.O_RDONLY | getattr(os, 'O_BINARY', 0) | getattr(os, 'O_NOINHERIT', 0)
    flags |= getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_NONBLOCK', 0)
    fd = os.open(path, flags)
    with os.fdopen(fd, 'rb') as stream:
        opened = signature(os.fstat(stream.fileno()))
        if opened != initial:
            raise WorkflowError('Installed file changed before reading: ' + str(path))
        payload = stream.read(50_000_001)
        finished = signature(os.fstat(stream.fileno()))
    final_info = plain(path).lstat()
    final = (*signature(final_info), final_info.st_ctime_ns)
    if len(payload) > 50_000_000 or initial != finished or path_initial != final or len(payload) != before.st_size:
        raise WorkflowError('Installed file changed during reading: ' + str(path))
    return {'identity': path_initial, 'sha256': digest(payload), 'matches': payload == expected}


def check_installed(project, preview_dir, archive, owner, hermes_root):
    """Compare disk bytes with a checked ZIP, without applying or loading it."""
    project, preview_dir = plain(project), plain(preview_dir)
    archive, hermes_root = plain(archive), plain(hermes_root)
    checked = check_promotion(project, preview_dir, owner, archive)
    if checked.get('release_zip_matches') is not True:
        raise WorkflowError('Release ZIP is not verified against the preview')
    manifest, members, agents, archive_hash = read_archive(project, archive, checked['preview_zip_sha256'])
    targets = {'plugin.js': hermes_root / 'desktop-plugins' / manifest['name'] / 'plugin.js'}
    targets.update({name: hermes_root / 'plugins' / manifest['name'] / Path(*PurePosixPath(name).parts)
                    for name in sorted(agents)})

    def snapshot():
        return {name: installed_file_snapshot(target, members[name]) for name, target in targets.items()}

    first = snapshot()
    second = snapshot()
    if first != second:
        raise WorkflowError('Installed files changed during comparison')
    checked_again = check_promotion(project, preview_dir, owner, archive)
    if checked_again != checked:
        raise WorkflowError('Release verification changed during comparison')
    if snapshot() != second:
        raise WorkflowError('Installed files changed during release verification')
    require(project, owner)
    if digest(regular(archive)) != archive_hash:
        raise WorkflowError('ZIP changed during comparison')

    files = {}
    for name, state in second.items():
        expected = digest(members[name])
        actual = None if state is None else state['sha256']
        status = 'missing' if state is None else ('match' if state['matches'] else 'different')
        files[name] = {'status': status, 'installed_sha256': actual, 'archive_sha256': expected}
    matched = all(record['status'] == 'match' for record in files.values())
    return {'status': 'disk_files_match' if matched else 'disk_files_differ_or_missing',
            'archive_sha256': archive_hash, 'version': manifest['version'], 'files': files,
            'disk_files_match': matched, 'install_performed': False,
            'installed': None, 'loaded': None, 'safe_to_install': False,
            'core_dependencies_checked': False, 'external_runtime_verified': False,
            'note': 'Read-only observations can change immediately and are not an atomic barrier. '
                    'Loaded code, core dependencies and safe installation are not established.'}


def windows_file_metadata(path):
    """Fingerprint all NTFS data streams plus owner, group and DACL; fail closed."""
    if os.name != 'nt':
        raise WorkflowError('Windows metadata inspection is unavailable')
    import ctypes
    from ctypes import wintypes
    class StreamData(ctypes.Structure):
        _fields_ = [('size', ctypes.c_longlong), ('name', ctypes.c_wchar * 296)]
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    first = kernel.FindFirstStreamW
    first.argtypes = [wintypes.LPCWSTR, ctypes.c_int, ctypes.POINTER(StreamData), wintypes.DWORD]
    first.restype = wintypes.HANDLE
    next_stream = kernel.FindNextStreamW
    next_stream.argtypes = [wintypes.HANDLE, ctypes.POINTER(StreamData)]
    next_stream.restype = wintypes.BOOL
    close = kernel.FindClose
    close.argtypes = [wintypes.HANDLE]
    close.restype = wintypes.BOOL
    item = StreamData()
    handle = first(str(plain(path)), 0, ctypes.byref(item), 0)
    if handle == ctypes.c_void_p(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    streams = {}
    try:
        while True:
            name = item.name
            if not name.startswith(':') or not name.endswith(':$DATA') or name in streams:
                raise WorkflowError('Unexpected Windows data stream: ' + name)
            h = sha256()
            length = 0
            with open(str(path) + name, 'rb') as stream:
                while True:
                    chunk = stream.read(1024 * 1024)
                    if not chunk:
                        break
                    h.update(chunk)
                    length += len(chunk)
            if length != item.size:
                raise WorkflowError('Windows data stream changed while reading: ' + name)
            streams[name] = {'size': length, 'sha256': h.hexdigest()}
            if not next_stream(handle, ctypes.byref(item)):
                error = ctypes.get_last_error()
                if error not in (18, 38):
                    raise ctypes.WinError(error)
                break
    finally:
        close(handle)
    if '::$DATA' not in streams:
        raise WorkflowError('Cannot inspect the default Windows data stream')
    security = ctypes.WinDLL('advapi32', use_last_error=True).GetFileSecurityW
    security.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD,
                         ctypes.POINTER(wintypes.DWORD)]
    security.restype = wintypes.BOOL
    needed = wintypes.DWORD()
    security(str(path), 0x1 | 0x2 | 0x4, None, 0, ctypes.byref(needed))
    if not needed.value:
        raise ctypes.WinError(ctypes.get_last_error())
    buffer = ctypes.create_string_buffer(needed.value)
    if not security(str(path), 0x1 | 0x2 | 0x4, buffer, needed.value, ctypes.byref(needed)):
        raise ctypes.WinError(ctypes.get_last_error())
    return {'streams': dict(sorted(streams.items())),
            'owner_group_dacl_sha256': digest(buffer.raw[:needed.value]),
            'file_attributes': getattr(path.stat(), 'st_file_attributes', 0)}


def stage_install(project, preview_dir, archive, out, owner, hermes_root):
    """Stage exact files and full Windows hard-link backups; never install them."""
    project, preview_dir = plain(project), plain(preview_dir)
    archive, hermes_root = plain(archive), plain(hermes_root)
    if os.name != 'nt':
        raise WorkflowError('Full installation backup is only verified on Windows')
    checked = check_promotion(project, preview_dir, owner, archive)
    if not checked.get('release_zip_matches'):
        raise WorkflowError('The official ZIP has not been verified against the preview')
    manifest, members, agents, zip_hash = read_archive(project, archive, checked['preview_zip_sha256'])
    target_root = hermes_root / 'plugins' / manifest['name']
    targets = {'plugin.js': hermes_root / 'desktop-plugins' / manifest['name'] / 'plugin.js'}
    targets.update({name: target_root.joinpath(*PurePosixPath(name).parts) for name in sorted(agents)})
    originals = {}
    for name, target in targets.items():
        require(project, owner)
        target = plain(target)
        if not target.is_relative_to(hermes_root):
            raise WorkflowError('Installation target outside Hermes')
        data = regular(target, missing=True)
        if data is None:
            originals[name] = None
            continue
        identity = file_identity(target)
        if target.stat().st_nlink != 1:
            raise WorkflowError('Installed file already has other hard links: ' + name)
        if regular(target) != data or file_identity(target) != identity:
            raise WorkflowError('Installed file changed while inspecting: ' + name)
        metadata = windows_file_metadata(target)
        if regular(target) != data or file_identity(target) != identity:
            raise WorkflowError('Installed file changed while reading metadata: ' + name)
        originals[name] = {'sha256': digest(data), 'identity': list(identity), 'metadata': metadata}
    out = make_run_dir(project, out)
    journal = {'schema': 1, 'status': 'preparing', 'project': str(project),
               'preview': str(preview_dir), 'archive': str(archive), 'version': manifest['version'],
               'archive_sha256': zip_hash, 'checks': checked['checks'],
               'installed': False, 'loaded': False, 'manual_rescan': False,
               'core_dependencies_checked': False, 'external_runtime_verified': False,
               'metadata_scope': 'NTFS data streams, owner, group, DACL and file attributes; SACL and other special metadata are not rechecked.',
               'note': 'Backups are hard links and share in-place edits until replacement. '
                       'Recheck before installation; do not restart without a safe maintenance barrier.',
               'files': {name: {'target': str(target), 'before': originals[name],
                                'candidate': str(out / 'candidate' / Path(*PurePosixPath(name).parts)),
                                'backup': (str(out / 'previous-full' / Path(*PurePosixPath(name).parts))
                                           if originals[name] is not None else None),
                                'candidate_sha256': digest(members[name]), 'backup_linked': False}
                         for name, target in targets.items()}}
    write_json(out / 'install-plan.json', journal)
    try:
        for name, target in targets.items():
            require(project, owner)
            target = plain(target)
            record = journal['files'][name]
            before = originals[name]
            candidate = out / 'candidate' / Path(*PurePosixPath(name).parts)
            put_new(candidate, members[name])
            if before is None:
                if regular(target, missing=True) is not None:
                    raise WorkflowError('Previously absent installed file appeared: ' + name)
                continue
            if (file_identity(target) != tuple(before['identity']) or target.stat().st_nlink != 1
                    or digest(regular(target)) != before['sha256'] or windows_file_metadata(target) != before['metadata']):
                raise WorkflowError('Installed file changed before full backup: ' + name)
            backup = plain(out / 'previous-full' / Path(*PurePosixPath(name).parts))
            backup.parent.mkdir(parents=True, exist_ok=True)
            plain(backup)
            os.link(target, backup)
            if (file_identity(backup) != tuple(before['identity'])
                    or file_identity(target) != tuple(before['identity'])
                    or backup.stat().st_nlink != 2 or target.stat().st_nlink != 2
                    or digest(regular(backup)) != before['sha256'] or windows_file_metadata(backup) != before['metadata']):
                raise WorkflowError('Cannot verify full backup: ' + name)
            record['backup'] = str(backup)
            record['backup_linked'] = True
            write_json(out / 'install-plan.json', journal)
        require(project, owner)
        for name, target in targets.items():
            before = originals[name]
            if before is None:
                if regular(target, missing=True) is not None:
                    raise WorkflowError('Installed file appeared during preparation: ' + name)
            else:
                backup = Path(journal['files'][name]['backup'])
                if (file_identity(target) != tuple(before['identity'])
                        or file_identity(backup) != tuple(before['identity'])
                        or target.stat().st_nlink != 2 or backup.stat().st_nlink != 2
                        or digest(regular(target)) != before['sha256']
                        or digest(regular(backup)) != before['sha256']
                        or windows_file_metadata(target) != before['metadata']
                        or windows_file_metadata(backup) != before['metadata']):
                    raise WorkflowError('Installed file changed during preparation: ' + name)
            if digest(regular(out / 'candidate' / Path(*PurePosixPath(name).parts))) != digest(members[name]):
                raise WorkflowError('Staged candidate changed: ' + name)
        check_promotion(project, preview_dir, owner, archive)
        journal['status'] = 'prepared_only'
        write_json(out / 'install-plan.json', journal)
        return {'status': 'prepared_only', 'plan': str(out / 'install-plan.json'),
                'archive_sha256': zip_hash, 'file_count': len(targets),
                'installed': False, 'loaded': False, 'manual_rescan': False,
                'note': journal['note']}
    except BaseException as error:
        journal['status'] = 'interrupted'
        journal['error'] = str(error)
        try:
            write_json(out / 'install-plan.json', journal)
        except (WorkflowError, OSError):
            pass
        raise


def check_stage(project, out, owner, hermes_root):
    """Recheck a prepared plan, including full backups; never apply it."""
    project, out, hermes_root = plain(project), plain(out), plain(hermes_root)
    require(project, owner)
    if not out.is_relative_to(project / '.local') or out == project / '.local':
        raise WorkflowError('Installation plan must be inside this project .local')
    plan = read_json(out / 'install-plan.json')
    if (plan.get('schema') != 1 or plan.get('status') != 'prepared_only'
            or plan.get('project') != str(project) or plan.get('installed') is not False
            or plan.get('loaded') is not False or plan.get('manual_rescan') is not False):
        raise WorkflowError('Installation plan is incomplete or changed')
    preview_dir = plain(plan.get('preview', ''))
    archive = plain(plan.get('archive', ''))
    checked = check_promotion(project, preview_dir, owner, archive)
    manifest, members, agents, zip_hash = read_archive(project, archive, checked['preview_zip_sha256'])
    if (plan.get('archive_sha256') != zip_hash or plan.get('version') != manifest['version']
            or plan.get('checks') != checked['checks']):
        raise WorkflowError('Installation plan no longer matches the checked ZIP')
    targets = {'plugin.js': hermes_root / 'desktop-plugins' / manifest['name'] / 'plugin.js'}
    targets.update({name: hermes_root / 'plugins' / manifest['name'] / Path(*PurePosixPath(name).parts)
                    for name in sorted(agents)})
    records = plan.get('files')
    if not isinstance(records, dict) or set(records) != set(targets):
        raise WorkflowError('Installation plan file list changed')
    for name, target in targets.items():
        require(project, owner)
        target = plain(target)
        record = records[name]
        candidate = out / 'candidate' / Path(*PurePosixPath(name).parts)
        backup = out / 'previous-full' / Path(*PurePosixPath(name).parts)
        if (not isinstance(record, dict) or record.get('target') != str(target)
                or record.get('candidate') != str(candidate)
                or record.get('candidate_sha256') != digest(members[name])
                or regular(candidate) != members[name]):
            raise WorkflowError('Prepared candidate changed: ' + name)
        before = record.get('before')
        if before is None:
            if record.get('backup') is not None or record.get('backup_linked') is not False or regular(target, missing=True) is not None:
                raise WorkflowError('Previously absent installed file appeared: ' + name)
            continue
        if (not isinstance(before, dict) or not isinstance(before.get('identity'), list)
                or len(before['identity']) != 2 or not re.fullmatch(r'[0-9a-f]{64}', before.get('sha256', ''))
                or record.get('backup') != str(backup) or record.get('backup_linked') is not True):
            raise WorkflowError('Full backup record is invalid: ' + name)
        identity = tuple(before['identity'])
        if (file_identity(target) != identity or file_identity(backup) != identity
                or target.stat().st_nlink != 2 or backup.stat().st_nlink != 2
                or digest(regular(target)) != before['sha256'] or digest(regular(backup)) != before['sha256']
                or windows_file_metadata(target) != before.get('metadata')
                or windows_file_metadata(backup) != before.get('metadata')):
            raise WorkflowError('Installed file or full backup changed: ' + name)
    require(project, owner)
    return {'status': 'prepared_files_still_match', 'file_count': len(targets),
            'installed': False, 'loaded': False, 'ready_to_install': False,
            'note': 'NTFS data streams, owner, group, DACL and attributes match; SACL and other special metadata are not rechecked. '
                    'External runtime, core dependencies and safe maintenance barrier remain to be checked.'}


def build_outputs(root, manifest, agents):
    """Recognize the builder's current writes; fail closed if the contract drifts."""
    source = regular(root / 'scripts/build.mjs').decode('utf-8')
    if len(re.findall(r'\bwriteFile\s*\(', source)) != 2:
        raise WorkflowError('Builder write contract changed; review it first')
    pattern = r"for\s*\(const\s+name\s+of\s+\[([^\]]*)\]\)\s*\{\s*const\s+source\s*=\s*await\s+readFile\(new\s+URL\(`source/usage-backend/\$\{name\}`,\s*root\)\)"
    matches = re.findall(pattern, source, re.DOTALL)
    if len(matches) != 1:
        raise WorkflowError('Cannot identify builder agent outputs')
    listed = re.findall(r"['\"]([^'\"]+)['\"]", matches[0])
    residue = re.sub(r"['\"][^'\"]+['\"]|[\s,]", '', matches[0])
    if residue or len(listed) != len(set(listed)) or set(listed) != agents:
        raise WorkflowError('Builder agent outputs differ from package declaration')
    return ['plugin.js'] + (sorted(agents) if manifest.get('hermesAgentPackage') is True else [])


def make_run_dir(root, out):
    root = plain(root)
    out = plain(out)
    local = root / '.local'
    if not out.is_relative_to(local) or out == local or not out.parent.is_dir():
        raise WorkflowError('Output must be a new directory under existing .local')
    out.mkdir(exist_ok=False)
    return out


def command(args, root, env):
    return subprocess.run(args, cwd=root, env=env, capture_output=True, text=True, encoding='utf-8', errors='replace')


def tool(name):
    found = shutil.which(name + '.cmd') if os.name == 'nt' and name == 'npm' else None
    found = found or shutil.which(name)
    if not found:
        raise WorkflowError('Missing command: ' + name)
    return found


def require_isolated_workspace(root):
    marker = read_json(root / '.local' / 'preview-identity.json')
    if marker.get('schema') != 1 or marker.get('workspace') != str(root):
        raise WorkflowError('Only an isolated preview workspace may be built')
    project = plain(marker.get('project', ''))
    if project == root or not root.is_relative_to(project / '.local'):
        raise WorkflowError('Preview workspace must be inside a separate project .local folder')
    return project


def build_and_check(root, owner, out, focuses, reviewed, *, runner=command, tools=None):
    root = plain(root)
    require_isolated_workspace(root)
    require(root, owner)
    if not reviewed:
        raise WorkflowError('The owner must first review the release scope')
    focuses = unique_focus(root, focuses)
    manifest = read_json(root / 'package.json')
    # Validate names and declarations before touching shared outputs.
    if manifest.get('name') != 'hermes-codex-visual' or not re.fullmatch(r'[0-9]+(?:\.[0-9]+){2}(?:[-+][A-Za-z0-9.-]+)?', manifest.get('version', '')):
        raise WorkflowError('Invalid project name or version')
    trusted_project_inputs(project_inputs(root), manifest)
    test_runtime = pinned_test_runtime(root)
    _, agents = declared_files(root, manifest)
    root_outputs = build_outputs(root, manifest, agents)
    archive = root / 'dist' / (manifest['name'] + '-v' + manifest['version'] + '-local.zip')
    if regular(archive, missing=True) is not None:
        raise WorkflowError('ZIP already exists; refusing to overwrite it')
    out = make_run_dir(root, out)
    journal = {'schema': 1, 'status': 'running', 'created_utc': datetime.now(timezone.utc).isoformat(),
               'scope_reviewed_by_owner': False, 'archive': str(archive), 'focus_requested': focuses,
               'steps': [], 'installed': False, 'loaded': False, 'test_runtime': test_runtime,
               'coverage': 'Selected scenarios only; additional checks and coverage require owner review.'}
    journal_path = out / 'run.json'
    write_json(journal_path, journal)
    try:
        baseline = {}
        for name in root_outputs + ['.local/plugin.js', 'dist/SHA256SUMS.txt']:
            data = regular(root / name, missing=True)
            baseline[name] = None if data is None else digest(data)
            if data is not None:
                put_new(out / 'previous-outputs' / Path(*PurePosixPath(name).parts), data)
        journal['previous_outputs'] = baseline
        journal['backup_scope'] = 'Regular file bytes only; Windows ACLs, alternate streams and other metadata are not backed up.'
        inputs = snapshot(root)
        journal['inputs_sha256'] = inputs
        cmds = tools or {'npm': tool('npm'), 'node': tool('node'), 'python': sys.executable, 'pwsh': tool('pwsh')}
        env = {key: value for key, value in os.environ.items()
               if not key.startswith(('GIT_', 'HCV_RELEASE_', 'HCV_TEST_RUNTIME_'))
               and key not in RESERVED_VISUAL_PATHS
               and key not in ('NODE_OPTIONS', 'NODE_PATH', 'PYTHONHOME', 'PYTHONPATH', 'PYTHONSTARTUP')}
        env.update(HCV_RELEASE_OWNER=owner, PYTHONIOENCODING='utf-8', PYTHONUTF8='1')
        journal['inherited_test_flags_sha256'] = test_flag_hashes(env)

        def step(name, args, extra_env=None):
            require(root, owner)
            begin = time.monotonic()
            result = runner(args, root, dict(env, **(extra_env or {})))
            elapsed = round(time.monotonic() - begin, 3)
            output = (result.stdout or '') + (result.stderr or '')
            log_name = str(len(journal['steps']) + 1).zfill(2) + '-' + name + '.log'
            log_data = output.encode('utf-8')
            put_new(out / 'logs' / log_name, log_data)
            journal['steps'].append({'name': name, 'elapsed_seconds': elapsed, 'exit_code': result.returncode,
                                     'log': 'logs/' + log_name, 'log_sha256': digest(log_data)})
            write_json(journal_path, journal)
            if result.returncode:
                raise WorkflowError('Step failed: ' + name)
            return output

        def expect_previous(name):
            data = regular(root / name, missing=True)
            if (None if data is None else digest(data)) != baseline[name]:
                raise WorkflowError('Shared output changed after backup: ' + name)

        for name in root_outputs:
            expect_previous(name)
        step('build-public', [cmds['npm'], 'run', 'build'])
        step('check-public', [cmds['npm'], 'run', 'check'])
        expect_previous('.local/plugin.js')
        step('build-local', [cmds['node'], 'scripts/build.mjs', '--local'])
        step('check-local', [cmds['node'], 'scripts/build.mjs', '--local', '--check'])
        if regular(root / 'plugin.js') != regular(root / '.local/plugin.js'):
            raise WorkflowError('Public and local modules differ')
        step('visual-assets', [cmds['node'], 'verification/visual-assets.mjs'])
        if regular(archive, missing=True) is not None:
            raise WorkflowError('ZIP appeared during the build; refusing to overwrite it')
        expect_previous('dist/SHA256SUMS.txt')
        step('package', [cmds['python'], '-B', 'scripts/package.py', '--local'])
        require(root, owner)
        _, members, agents, archive_hash = read_archive(root, archive)
        module_hash = digest(members['plugin.js'])
        journal.update(archive_sha256=archive_hash, module_sha256=module_hash,
                       agent_sha256={name: digest(members[name]) for name in sorted(agents)})
        extract = out / 'package' / manifest['name']
        for name, data in members.items():
            put_new(extract / Path(*PurePosixPath(name).parts), data)
        branch_results = {}
        for index, focus in enumerate(focuses):
            if digest(regular(archive)) != archive_hash or digest(regular(extract / 'plugin.js')) != module_hash:
                raise WorkflowError('Candidate changed before test')
            evidence = 'release-' + uuid4().hex + '-' + str(index)
            package_env = {'HERMES_VISUAL_ACTIVITY_PACKAGE': str(extract)}
            if focus == 'turn-diff':
                package_env['HERMES_VISUAL_TIMELINE_PARITY'] = '1'
            if focus == 'turn-diff' or env.get('HERMES_VISUAL_TIMELINE_PARITY') == '1':
                package_env['HERMES_VISUAL_TIMELINE_PACKAGE'] = str(extract)
            output = step('focus-' + focus, [cmds['pwsh'], '-NoProfile', '-File', 'verification/run-local.ps1',
                          '-Focus', focus, '-Plugin', str(extract / 'plugin.js'), '-EvidenceVersion', evidence], package_env)
            if not re.search(r'Fixture module SHA-256\s+' + re.escape(module_hash) + r'\b', output, re.IGNORECASE):
                raise WorkflowError('Scenario did not prove the fixture module hash: ' + focus)
            expected_line = ('HCV_PRIVATE_RUNTIME ' + test_runtime['runtime_id'] + ' ' +
                             test_runtime['manifest_sha256'] + ' ' + test_runtime['tree_sha256'])
            if len(re.findall(r'(?m)^' + re.escape(expected_line) + r'\r?$', output)) != 1:
                raise WorkflowError('Scenario did not prove the private runtime: ' + focus)
            check_gateway_audit(output, require_mcp=focus == 'sidebar-activity')
            branch_results[focus] = branch_evidence(root, focus, evidence, module_hash,
                                                     branch_backend_hash(focus, members))
            if digest(regular(archive)) != archive_hash:
                raise WorkflowError('ZIP changed during test')
            for name, data in members.items():
                if regular(extract / Path(*PurePosixPath(name).parts)) != data:
                    raise WorkflowError('Extracted ZIP member changed during test: ' + name)
            if snapshot(root) != inputs:
                raise WorkflowError('Source or verification inputs changed during test')
        require(root, owner)
        read_archive(root, archive, archive_hash)
        journal['branch_evidence'] = branch_results
        journal['status'] = ('selected_scenarios_passed' if all(item['confirmed'] for item in branch_results.values())
                             else 'completed_with_unconfirmed_branches')
        write_json(journal_path, journal)
        return journal
    except BaseException as error:
        journal['status'] = 'stopped'
        journal['error'] = str(error)
        write_json(journal_path, journal)
        raise


def wait_available(root, timeout, interval=0.5):
    if not math.isfinite(timeout) or timeout <= 0 or timeout > 600:
        raise WorkflowError('Wait timeout must be within 0-600 seconds')
    started = time.monotonic()
    lock = lock_module(root)
    while True:
        state = lock._read(root)
        if state is None or state['owner'] is None:
            return {'available': True, 'elapsed_seconds': round(time.monotonic() - started, 3),
                    'message': 'No lock acquired; acquire before writing.'}
        remaining = timeout - (time.monotonic() - started)
        if remaining <= 0:
            return {'available': False, 'elapsed_seconds': round(time.monotonic() - started, 3), 'owner': state['owner']}
        time.sleep(min(interval, remaining))


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).absolute().parent.parent)
    parser.add_argument('--owner', default=os.environ.get('HCV_RELEASE_OWNER', ''))
    sub = parser.add_subparsers(dest='action', required=True)
    inspect = sub.add_parser('inspect', help='Save input hashes for review without running project code')
    inspect.add_argument('--out', required=True, type=Path)
    candidate = sub.add_parser('preview', help='Build and check only in a unique isolated folder')
    candidate.add_argument('--out', required=True, type=Path)
    candidate.add_argument('--focus', required=True, action='append')
    candidate.add_argument('--reviewed-inputs-sha256', required=True)
    verify = sub.add_parser('verify', help='Compare reviewed preview and optional final ZIP under the release lock')
    verify.add_argument('--preview', required=True, type=Path)
    verify.add_argument('--archive', type=Path)
    compare = sub.add_parser('check-installed', help='Read-only disk comparison with a checked ZIP; does not install')
    compare.add_argument('--preview', required=True, type=Path)
    compare.add_argument('--archive', required=True, type=Path)
    stage = sub.add_parser('stage-install', help='Prepare full backups; never install or restart Hermes')
    stage.add_argument('--preview', required=True, type=Path)
    stage.add_argument('--archive', required=True, type=Path)
    stage.add_argument('--out', required=True, type=Path)
    recheck = sub.add_parser('check-stage', help='Recheck prepared files and full backups, without installing')
    recheck.add_argument('--out', required=True, type=Path)
    wait = sub.add_parser('wait')
    wait.add_argument('--timeout', type=float, default=60)
    args = parser.parse_args()
    root = Path(os.path.abspath(args.root))
    try:
        if args.action == 'inspect':
            result = inspect_inputs(root, Path(os.path.abspath(args.out)))
        elif args.action == 'preview':
            result = preview(root, Path(os.path.abspath(args.out)), args.focus, args.reviewed_inputs_sha256)
        elif args.action == 'verify':
            archive = Path(os.path.abspath(args.archive)) if args.archive else None
            result = check_promotion(root, Path(os.path.abspath(args.preview)), args.owner, archive,
                                     timing_sink=lambda seconds: print(
                                         f'HCV_RUNTIME_GUARD_VERIFY_SECONDS {seconds:.3f}', file=sys.stderr))
        elif args.action == 'check-installed':
            if not os.environ.get('LOCALAPPDATA'):
                raise WorkflowError('LOCALAPPDATA is unavailable')
            result = check_installed(root, Path(os.path.abspath(args.preview)), Path(os.path.abspath(args.archive)),
                                     args.owner, Path(os.environ['LOCALAPPDATA']) / 'hermes')
        elif args.action == 'stage-install':
            if not os.environ.get('LOCALAPPDATA'):
                raise WorkflowError('LOCALAPPDATA is unavailable')
            hermes = Path(os.environ['LOCALAPPDATA']) / 'hermes'
            result = stage_install(root, Path(os.path.abspath(args.preview)), Path(os.path.abspath(args.archive)),
                                   Path(os.path.abspath(args.out)), args.owner, hermes)
        elif args.action == 'check-stage':
            if not os.environ.get('LOCALAPPDATA'):
                raise WorkflowError('LOCALAPPDATA is unavailable')
            result = check_stage(root, Path(os.path.abspath(args.out)), args.owner,
                                 Path(os.environ['LOCALAPPDATA']) / 'hermes')
        else:
            result = wait_available(root, args.timeout)
        print(json.dumps(result, ensure_ascii=False))
        if args.action == 'preview' and result.get('status') != 'selected_scenarios_passed':
            return 1
        if args.action == 'check-installed' and result.get('disk_files_match') is not True:
            return 1
        return 0 if result.get('available', True) else 1
    except (WorkflowError, OSError, ValueError, SyntaxError) as error:
        print(str(error), file=sys.stderr)
        return 2
    except Exception as error:
        print(f'{type(error).__name__}: {error}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    raise SystemExit(main())
