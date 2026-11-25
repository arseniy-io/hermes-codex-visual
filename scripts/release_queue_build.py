"""Content-addressed release bases and build receipts for the release queue.

The coordinator supplies the trusted selection and a private state directory.
Bases are stored in state/bases. Each build gets a fresh workspace with its own
preview lock and logs. The receipt identifies the exact selection and ZIP and
maps each transferable build output to its path and SHA-256.

Selection may include integration_checks and, when build or test files changed,
the coordinator's independently reviewed reviewed_inputs_sha256. The existing
workflow allowlist still controls its pinned executable inputs. Workspace
isolation protects project outputs and assumes trusted code and dependencies.
"""

import base64
from functools import wraps
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
from tempfile import TemporaryDirectory, mkdtemp
from uuid import uuid4

# Integrate beside this trusted module in scripts/. Never import orchestration
# code from a snapshot, a queued payload or the candidate's workspace.
import release_workflow as workflow


class BuildError(RuntimeError):
    pass


INPUT_DIRS = ('source', 'verification', 'scripts')
ROOT_INPUTS = {'package.json', 'package-lock.json', 'LICENSE', 'THIRD_PARTY_NOTICES.txt'}
VERSION = re.compile(r'[0-9]+(?:\.[0-9]+){2}(?:[-+][A-Za-z0-9.-]+)?\Z')
BRANCH = re.compile(r'[a-z0-9-]+\Z')
YAML_VERSION = re.compile(
    rb'''(?m)^(version[ \t]*:[ \t]*)(["']?)([0-9A-Za-z.+-]+)\2([ \t]*(?:\#[^\r\n]*)?)(?=\r?$)'''
)


def _checked(function):
    @wraps(function)
    def check(*args, **kwargs):
        try:
            return function(*args, **kwargs)
        except BuildError:
            raise
        except (OSError, RuntimeError, TypeError, ValueError, subprocess.SubprocessError) as error:
            raise BuildError(str(error)) from error
    return check


def _hash(value, label):
    if not isinstance(value, str) or not re.fullmatch(r'[0-9a-f]{64}', value):
        raise BuildError(f'Invalid SHA-256 for {label}')
    return value


def _version(value):
    if not isinstance(value, str) or len(value) > 80 or not VERSION.fullmatch(value):
        raise BuildError('Invalid release version')
    return value


def _json(data, label):
    def unique(pairs):
        result = dict(pairs)
        if len(result) != len(pairs):
            raise BuildError(f'Duplicate JSON key in {label}')
        return result

    result = json.loads(data.decode('utf-8'), object_pairs_hook=unique)
    if not isinstance(result, dict):
        raise BuildError(f'Expected a JSON object in {label}')
    return result


def _json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + '\n').encode('utf-8')


def _input_name(name):
    name = workflow.safe_name(name)
    parts = name.split('/')
    if len(parts) == 1 and name in ROOT_INPUTS:
        return name
    if (len(parts) < 2 or parts[0] not in INPUT_DIRS
            or any(part.casefold() in {'.git', '.local', 'node_modules', '__pycache__',
                                      '.pytest_cache', '.pytest-cache'} for part in parts[1:])
            or parts[-1].casefold().endswith(('.pyc', '.pyo'))
            or (len(parts) > 2 and parts[0] == 'verification'
                and parts[1].casefold().startswith(('synthetic-', 'capture-')))):
        raise BuildError(f'Path is outside the release inputs: {name}')
    return name


def _index_path(index, name, owner):
    parts = _input_name(name).split('/')
    for length in range(1, len(parts) + 1):
        path = '/'.join(parts[:length])
        entry = (path, length == len(parts), owner)
        previous = index.setdefault(path.casefold(), entry)
        if previous[:2] != entry[:2]:
            raise BuildError(f'Case or file/directory collision: {previous[0]} ({previous[2]}) and {path} ({owner})')


def _path_index(names, owner='saved base'):
    index = {}
    for name in sorted(names):
        _index_path(index, name, owner)
    return index


def _separate(project, destination):
    destination = workflow.plain(destination)
    local = project / '.local'
    if (project.is_relative_to(destination) or destination == local
            or (destination.is_relative_to(project) and not destination.is_relative_to(local))):
        raise BuildError(f'State must be separate from project inputs: {destination}')
    return destination


def _input_bytes(root, name, expected, *, frozen=False):
    path = workflow.plain(root / name)
    before = path.lstat()
    data = workflow.regular(path)
    after = path.lstat()
    identity = lambda info: (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)
    if (identity(before) != identity(after) or workflow.digest(data) != expected
            or (frozen and (before.st_nlink != 1 or after.st_nlink != 1))):
        raise BuildError(f'Input changed or was replaced: {name}')
    return data


def _fingerprint(project):
    inputs = workflow.project_inputs(project)
    _path_index(inputs)
    package = _json(_input_bytes(project, 'package.json', inputs['package.json']), 'package.json')
    return {'id': workflow.inputs_hash(inputs), 'version': _version(package.get('version')), 'files': inputs}


@_checked
def fingerprint(project: Path) -> dict:
    """The id is exactly the reviewed inputs_sha256 used by release_workflow."""
    return _fingerprint(workflow.plain(project))


def _base_identity(manifest):
    return {key: manifest[key] for key in ('id', 'version')}


def _mkdir_with_inputs(tree, inputs, read):
    tree.mkdir()
    for name in INPUT_DIRS:
        (tree / name).mkdir()
    for name in inputs:
        workflow.put_new(tree / name, read(name))


def _frozen_inventory(tree, files):
    index = _path_index(files)
    allowed = {entry[0]: entry[1] for entry in index.values()}
    allowed.update(dict.fromkeys(INPUT_DIRS, False))
    found = set()
    folders = [tree]
    while folders:
        for path in workflow.plain(folders.pop()).iterdir():
            name = path.relative_to(tree).as_posix()
            mode = workflow.plain(path).lstat().st_mode
            if name not in allowed or not (stat.S_ISREG(mode) if allowed[name] else stat.S_ISDIR(mode)):
                raise BuildError(f'Unexpected path in frozen base: {name}')
            found.add(name)
            if not allowed[name]:
                folders.append(path)
    if found != allowed.keys():
        raise BuildError('Frozen base has missing paths: ' + ', '.join(sorted(allowed.keys() - found)[:10]))


def _open_base(entry, id):
    entry = workflow.plain(entry)
    if {path.name for path in entry.iterdir()} != {'manifest.json', 'tree'}:
        raise BuildError(f'Incomplete or unexpected entries for base {id}')
    manifest_path = workflow.plain(entry / 'manifest.json')
    if manifest_path.lstat().st_nlink != 1:
        raise BuildError(f'Linked manifest for base {id}')
    manifest = _json(workflow.regular(manifest_path), 'base manifest')
    if (set(manifest) != {'schema', 'id', 'version', 'files'} or manifest['schema'] != 1
            or manifest['id'] != id or not isinstance(manifest['files'], dict)):
        raise BuildError(f'Invalid manifest for base {id}')
    files = manifest['files']
    if not ROOT_INPUTS <= files.keys() or workflow.inputs_hash(files) != id:
        raise BuildError(f'Manifest hash differs for base {id}')
    tree = workflow.plain(entry / 'tree')
    _frozen_inventory(tree, files)
    values = {name: _input_bytes(tree, name, _hash(expected, name), frozen=True)
              for name, expected in files.items()}
    if _version(_json(values['package.json'], 'package.json').get('version')) != manifest['version']:
        raise BuildError(f'Package version differs for base {id}')
    return tree, _base_identity(manifest), values


@_checked
def load_base(storage: Path, id: str) -> Path:
    """Verify all saved files and return the root of the input tree."""
    id = _hash(id, 'base id')
    return _open_base(workflow.plain(storage) / id, id)[0]


@_checked
def snapshot(project: Path, storage: Path, reviewed_sha256: str) -> dict:
    """Publish a complete verified copy with one same-directory rename."""
    project = workflow.plain(project)
    storage = _separate(project, storage)
    id = _hash(reviewed_sha256, 'reviewed inputs')
    manifest = _fingerprint(project)
    if manifest['id'] != id:
        raise BuildError(f'Project inputs differ from the reviewed SHA-256 {id}')
    storage.mkdir(parents=True, exist_ok=True)
    target = workflow.plain(storage / id)
    if target.exists():
        return _open_base(target, id)[1]
    with TemporaryDirectory(prefix='.base-', dir=storage) as directory:
        pending = Path(directory) / 'entry'
        pending.mkdir()
        files = manifest['files']
        _mkdir_with_inputs(pending / 'tree', files, lambda name: _input_bytes(project, name, files[name]))
        if _fingerprint(project) != manifest:
            raise BuildError('Project inputs changed during snapshot')
        workflow.put_new(pending / 'manifest.json', _json_bytes(dict(manifest, schema=1)))
        _open_base(pending, id)
        try:
            pending.rename(target)
        except OSError:
            # Another worker may have published the same id while we copied it.
            if not target.exists():
                raise
        return _open_base(target, id)[1]


def _bytes(value, task, name):
    if value is None:
        return None
    if not isinstance(value, str):
        raise BuildError(f'Invalid base64 in {task}: {name}')
    try:
        return base64.b64decode(value, validate=True)
    except ValueError as error:
        raise BuildError(f'Invalid base64 in {task}: {name}') from error


def _task_label(item):
    return f"{item['task_id']}@{item['revision']}"


def _item(item, opened):
    if not isinstance(item, dict):
        raise BuildError('Invalid task revision')
    task = item.get('task_id')
    if not isinstance(task, str) or not task or not task.isprintable() or len(task) > 200:
        raise BuildError('Invalid task id')
    if type(item.get('revision')) is not int or item['revision'] < 1:
        raise BuildError(f'Invalid revision for {task}')
    label = _task_label(item)
    _hash(item.get('digest'), f'digest of {label}')
    id = _hash(item.get('base_id'), f'base of {label}')
    payload = item.get('payload')
    if not isinstance(payload, dict) or not isinstance(payload.get('files'), list):
        raise BuildError(f'Invalid payload for {label}')
    base = opened(id)[2]
    index = _path_index(base)
    files = {}
    for change in payload['files']:
        if not isinstance(change, dict) or not {'path', 'before', 'after'} <= change.keys():
            raise BuildError(f'Incomplete path change in {label}')
        name = _input_name(change['path'])
        _index_path(index, name, label)
        if name in files:
            raise BuildError(f'Duplicate path in {label}: {name}')
        before, after = (_bytes(change[key], label, name) for key in ('before', 'after'))
        if before != base.get(name):
            raise BuildError(f'Preimage differs from saved base {id} for {label}: {name}')
        if before == after:
            raise BuildError(f'No change in {label}: {name}')
        files[name] = (before, after)
    return id, files


def _utf8(data):
    try:
        data.decode('utf-8')
    except UnicodeDecodeError:
        return False
    return b'\0' not in data


def _merge(current, ancestor, desired, label, others, name, run):
    if desired == ancestor:
        return current
    if current == ancestor:
        return desired
    conflict = f'Conflict at {name} between {others} and {label}'
    if any(data is not None and not _utf8(data) for data in (current, ancestor, desired)):
        raise BuildError(conflict + ': overlapping binary edits')
    if current == desired:
        return current
    if None in (current, ancestor, desired):
        raise BuildError(conflict + ': addition or deletion overlaps another edit')
    with TemporaryDirectory(prefix='merge-', dir=run) as folder:
        root = Path(folder)
        for filename, data in zip(('current', 'base', 'incoming'), (current, ancestor, desired)):
            workflow.put_new(root / filename, data)
        env = {key: value for key, value in os.environ.items() if not key.upper().startswith('GIT_')}
        env.update(GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull,
                   GIT_CEILING_DIRECTORIES=str(root.parent), GIT_OPTIONAL_LOCKS='0')
        try:
            result = subprocess.run([workflow.tool('git'), '--no-pager', 'merge-file', '-p', '--',
                                     'current', 'base', 'incoming'], cwd=root, env=env,
                                    capture_output=True, timeout=30, check=False)
        except (OSError, workflow.WorkflowError, subprocess.SubprocessError) as error:
            raise BuildError(f'{conflict}: merge-file could not complete: {error}') from error
    if result.returncode != 0:
        detail = result.stderr.decode('utf-8', 'replace').strip()
        raise BuildError(conflict + (f': {detail}' if detail else ': incompatible text edits'))
    return result.stdout


def _combine(storage, selection, run):
    bases = {}

    def opened(id):
        if id not in bases:
            bases[id] = _open_base(storage / id, id)
        return bases[id]

    selected = selection.get('base')
    if not isinstance(selected, dict):
        raise BuildError('Selection has no saved base')
    selected_id = _hash(selected.get('id'), 'selected base')
    _, identity, base = opened(selected_id)
    if selected.get('version') != identity['version']:
        raise BuildError('Selected base identity differs from its snapshot')
    entries = selection.get('items')
    if not isinstance(entries, list) or not entries:
        raise BuildError('Selection has no tasks')
    values = dict(base)
    affected = {}
    checked_paths = _path_index(base)
    tasks, checks = {}, []
    for item in entries:
        base_id, changes = _item(item, opened)
        label, task = _task_label(item), item['task_id']
        if task in tasks:
            raise BuildError(f'Selection has multiple revisions of task {task}')
        focuses = item.get('checks')
        if not isinstance(focuses, list) or not focuses or any(
                not isinstance(focus, str) or not BRANCH.fullmatch(focus) for focus in focuses):
            raise BuildError(f'No usable Focus for {label}')
        tasks[task] = focuses
        checks.extend(focuses)
        installed = item.get('installed_revision')
        old = {}
        if installed is not None:
            old_base, old_changes = _item(installed, opened)
            if installed['task_id'] != task or installed['revision'] >= item['revision']:
                raise BuildError(f'Invalid installed predecessor for {label}')
            if old_base == base_id:
                if selected_id == base_id:
                    raise BuildError(f'Selected base does not include installed predecessor {_task_label(installed)}')
                old = old_changes
            elif base_id != selected_id:
                raise BuildError(f'Cannot prove that base {base_id} inherits {_task_label(installed)} for {label}')
        if not changes and not old:
            raise BuildError(f'Empty release delta for {label}')
        for name in sorted(changes.keys() | old.keys()):
            previous = affected.get(name, [])
            _index_path(checked_paths, name, label)
            original, desired = changes[name] if name in changes else (old[name][0], old[name][0])
            ancestor = old[name][1] if name in old else original
            current = values.get(name)
            other = ', '.join(previous) or f'selected base {selected_id}'
            if not previous and name in old:
                other += f' including {_task_label(installed)}'
            merged = _merge(current, ancestor, desired, label, other, name, run)
            if merged is None:
                values.pop(name, None)
            else:
                values[name] = merged
            if merged != current:
                affected.setdefault(name, []).append(label)
    extra = selection.get('integration_checks', [])
    if not isinstance(extra, list) or any(not isinstance(focus, str) or not BRANCH.fullmatch(focus) for focus in extra):
        raise BuildError('Invalid combined project Focus list')
    return base, values, list(dict.fromkeys(checks + extra)), tasks


def _set_version(values, version):
    for name in ('package.json', 'package-lock.json'):
        package = _json(values.get(name, b''), name)
        _version(package.get('version'))
        package['version'] = version
        if name == 'package-lock.json':
            packages = package.get('packages')
            if not isinstance(packages, dict) or not isinstance(packages.get(''), dict):
                raise BuildError('Package lock has no root package')
            _version(packages[''].get('version'))
            packages['']['version'] = version
        values[name] = _json_bytes(package)
        if name == 'package.json':
            agents = package.get('hermesAgentPackage') is True
    if agents:
        name = 'source/usage-backend/plugin.yaml'
        data = values.get(name, b'')
        if len(re.findall(rb'(?m)^version[ \t]*:', data)) != 1:
            raise BuildError('Agent plugin version is missing or ambiguous')
        data, count = YAML_VERSION.subn(lambda m: m[1] + m[2] + version.encode('ascii') + m[2] + m[4], data)
        if count != 1:
            raise BuildError('Invalid agent plugin version')
        values[name] = data


def _stage_esbuild(project, workspace, inputs):
    lock = _json(inputs['package-lock.json'], 'package-lock.json').get('packages', {})
    if not isinstance(lock, dict):
        raise BuildError('Invalid package lock dependencies')
    names = ['esbuild']
    native = workflow.plain(project / 'node_modules/@esbuild')
    if native.is_dir():
        names.extend('@esbuild/' + path.name for path in sorted(native.iterdir())
                     if re.fullmatch(r'[a-z0-9]+-[a-z0-9]+', path.name))
    if len(names) == 1:
        raise BuildError('The controlled project has no installed native esbuild dependency')
    staged = {}
    for name in names:
        relative = 'node_modules/' + name
        entry = lock.get(relative)
        expected = entry.get('version') if isinstance(entry, dict) else None
        manifest_name = relative + '/package.json'
        manifest_bytes = workflow.regular(project / manifest_name)
        manifest = _json(manifest_bytes, manifest_name)
        if not expected or manifest.get('name') != name or manifest.get('version') != expected:
            raise BuildError(f'Installed {name} does not match the candidate package lock')
        if name == 'esbuild' and manifest.get('main') != 'lib/main.js':
            raise BuildError('The controlled esbuild entry point changed')
        member = 'lib/main.js' if name == 'esbuild' else ('esbuild.exe' if '/win32-' in name else 'bin/esbuild')
        module_name = relative + '/' + member
        source = workflow.plain(project / module_name)
        module_bytes = workflow.regular(source)
        target = workspace / module_name
        workflow.put_new(target, module_bytes)
        if name != 'esbuild' and os.name != 'nt':
            target.chmod(stat.S_IMODE(source.stat().st_mode) & 0o777)
        workflow.put_new(workspace / manifest_name, manifest_bytes)
        staged[manifest_name] = workflow.digest(manifest_bytes)
        staged[module_name] = workflow.digest(module_bytes)
    return staged


def _run_command(args, root, env):
    # Execute the two reviewed npm manifest commands directly. No lifecycle
    # hooks, npm config, dependency installers or network access are needed.
    temp_root = None
    if os.name == 'nt':
        local = os.environ.get('LOCALAPPDATA')
        if not local:
            raise BuildError('LOCALAPPDATA is required for an isolated short test path')
        parent = workflow.plain(Path(local) / 'hcv')
        parent.mkdir(parents=True, exist_ok=True)
        parent = workflow.plain(parent)
        temp_root = workflow.plain(mkdtemp(prefix='q-', dir=parent))
        if temp_root.parent != parent or not temp_root.name.startswith('q-'):
            raise BuildError('Unexpected isolated temporary directory')
        temp = str(temp_root)
    else:
        temp = str(root / '.local' / 'tmp')
    env = {key: value for key, value in env.items()
           if not key.upper().startswith('NPM_CONFIG_') and key.upper() not in
           {'ESBUILD_BINARY_PATH', 'NODE_OPTIONS', 'NODE_PATH', 'PYTHONHOME', 'PYTHONPATH', 'PYTHONSTARTUP'}}
    env.update(TEMP=temp, TMP=temp, TMPDIR=temp, HCV_RELEASE_PYTHON=sys.executable, PYTHONDONTWRITEBYTECODE='1')
    if args[0] == 'queue-manifest-command':
        node = workflow.tool('node')
        if args[1:] == ['run', 'build']:
            result = workflow.command([node, 'scripts/build.mjs'], root, env)
        elif args[1:] == ['run', 'check']:
            result = workflow.command([node, 'scripts/build.mjs', '--check'], root, env)
            if result.returncode == 0:
                syntax = workflow.command([node, '--check', 'plugin.js'], root, env)
                result.returncode = syntax.returncode
                result.stdout += syntax.stdout
                result.stderr += syntax.stderr
        else:
            raise BuildError('Unexpected build manifest command')
    else:
        result = workflow.command(args, root, env)
    if temp_root is not None:
        if result.returncode == 0:
            # Delete only this invocation's freshly created directory.
            if workflow.plain(temp_root) != temp_root or temp_root.parent != parent:
                raise BuildError('Temporary directory changed during verification')
            shutil.rmtree(temp_root)
        else:
            result.stderr = (result.stderr or '') + '\nIsolated temporary files retained at: ' + str(temp_root)
    return result


def _workspace(run, inputs, values):
    local = run / '.local'
    local.mkdir()
    workspace = local / 'workspace'
    _mkdir_with_inputs(workspace, inputs, values.__getitem__)
    if _fingerprint(workspace)['files'] != inputs:
        raise BuildError('Candidate workspace differs from the expected inputs')
    workflow.put_new(workspace / '.local/preview-identity.json',
                     _json_bytes({'schema': 1, 'project': str(run), 'workspace': str(workspace)}))
    (workspace / '.local/tmp').mkdir()
    return workspace


def _file_hashes(values):
    return {name: workflow.digest(data) for name, data in sorted(values.items())}


@_checked
def prove_base(project: Path, state: Path, base: dict, archive_sha256: str, *,
               installed_agent_version=None) -> None:
    """Rebuild the frozen inputs at their original version and match the complete ZIP."""
    project = workflow.plain(project)
    state = _separate(project, state)
    expected_zip = _hash(archive_sha256, 'accepted archive')
    if not isinstance(base, dict):
        raise BuildError('Invalid base identity')
    id = _hash(base.get('id'), 'base id')
    _, identity, values = _open_base(state / 'bases' / id, id)
    version = identity['version']
    if base.get('version') != version:
        raise BuildError('Base version differs from its snapshot')
    inputs = _file_hashes(values)
    for name in ('scripts/build.mjs', 'scripts/package.py', 'scripts/release_lock.py'):
        if inputs.get(name) not in workflow.TRUSTED_EXECUTABLE_INPUTS[name]:
            raise BuildError(f'Executable input has no trusted hash: {name}')
    package = _json(values['package.json'], 'package.json')
    if package.get('name') != 'hermes-codex-visual':
        raise BuildError('Invalid base package name')

    with TemporaryDirectory(prefix='prove-', dir=state) as folder:
        workspace = _workspace(Path(folder), inputs, values)
        workflow.require_isolated_workspace(workspace)
        _, agents = workflow.declared_files(workspace, package)
        workflow.build_outputs(workspace, package, agents)
        dependencies = _stage_esbuild(project, workspace, values)
        owner = 'base-proof-' + uuid4().hex
        lock = workflow.lock_module(workspace)
        env = {key: value for key, value in os.environ.items()
               if not key.upper().startswith(('GIT_', 'HCV_RELEASE_', 'HCV_TEST_RUNTIME_'))}
        env.update(HCV_RELEASE_OWNER=owner, PYTHONIOENCODING='utf-8', PYTHONUTF8='1')
        node = workflow.tool('node')
        commands = ([node, 'scripts/build.mjs'], [node, 'scripts/build.mjs', '--local'],
                    [sys.executable, '-B', 'scripts/package.py', '--local'])
        lock.change(workspace, 'acquire', owner, task='isolated base proof')
        try:
            for args in commands:
                result = _run_command(args, workspace, env)
                if result.returncode != 0:
                    raise BuildError(f'Base proof command failed ({" ".join(args[1:])}): '
                                     f'{(result.stderr or result.stdout).strip()}')
            if workflow.regular(workspace / 'plugin.js') != workflow.regular(workspace / '.local/plugin.js'):
                raise BuildError('Base public and local modules differ')
            archive = workspace / 'dist' / f'hermes-codex-visual-v{version}-local.zip'
            workflow.read_archive(workspace, archive, expected_zip,
                                  installed_agent_version=installed_agent_version)
            if _fingerprint(workspace)['files'] != inputs:
                raise BuildError('Frozen base inputs changed during the proof')
            for name, expected in dependencies.items():
                _input_bytes(workspace, name, expected, frozen=True)
        finally:
            lock.change(workspace, 'release', owner, note='isolated base proof finished')


def _verified_outputs(workspace, version, checks, result):
    archive = workspace / 'dist' / f'hermes-codex-visual-v{version}-local.zip'
    journal_path = workspace / '.local/run/run.json'
    journal_bytes = workflow.regular(journal_path)
    if _json(journal_bytes, 'verification journal') != result or result.get('archive') != str(archive):
        raise BuildError('Verification journal differs from the build result')
    if result.get('focus_requested') != checks:
        raise BuildError('Verification did not run the requested set of scenarios')
    runtime = workflow.pinned_test_runtime(workspace)
    if result.get('test_runtime') != runtime:
        raise BuildError('Verification runtime differs from the pinned test runtime')
    branches = result.get('branch_evidence', {})
    if result.get('status') != 'selected_scenarios_passed' or set(branches) != set(checks):
        missing = [focus for focus in checks if branches.get(focus, {}).get('confirmed') is not True]
        raise BuildError('Required Focus did not produce confirmed branch evidence: ' + ', '.join(missing or checks))
    archive_hash = _hash(result.get('archive_sha256'), 'verified ZIP')
    package, members, agents, _ = workflow.read_archive(workspace, archive, archive_hash)
    module_hash = workflow.digest(members['plugin.js'])
    if package['version'] != version or result.get('module_sha256') != module_hash:
        raise BuildError('ZIP version or module differs from the verification journal')
    if result.get('agent_sha256') != {name: workflow.digest(members[name]) for name in agents}:
        raise BuildError('ZIP agent files differ from the verification journal')
    extracted = journal_path.parent / 'package' / package['name']
    for name, data in members.items():
        if workflow.regular(extracted / name) != data:
            raise BuildError(f'Tested package file changed: {name}')
    for focus in checks:
        backend_hash = workflow.branch_backend_hash(focus, members)
        evidence = branches[focus]
        if (evidence.get('confirmed') is not True or evidence != workflow.branch_evidence(
                workspace, focus, evidence.get('evidence_version', ''), module_hash, backend_hash)):
            raise BuildError(f'Focus evidence missing or changed: {focus}')
    steps = ['build-public', 'check-public', 'build-local', 'check-local', 'visual-assets', 'package']
    steps += ['focus-' + focus for focus in checks]
    logged = result.get('steps', [])
    if len(logged) != len(steps):
        raise BuildError('Verification step log is incomplete')
    for index, (step, name) in enumerate(zip(logged, steps), 1):
        path = f'logs/{index:02d}-{name}.log'
        log = workflow.regular(journal_path.parent / path)
        if (step.get('name') != name or step.get('exit_code') != 0 or step.get('log') != path
                or workflow.digest(log) != step.get('log_sha256')):
            raise BuildError(f'Verification step log is invalid: {name}')
        if name.startswith('focus-'):
            output = log.decode('utf-8')
            marker = 'HCV_PRIVATE_RUNTIME ' + ' '.join(runtime.values())
            if (output.splitlines().count(marker) != 1
                    or not re.search(r'Fixture module SHA-256\s+' + module_hash + r'\b', output, re.IGNORECASE)):
                raise BuildError(f'Verification log does not identify the exact runtime and module: {name}')
            workflow.check_gateway_audit(output, require_mcp=name == 'focus-sidebar-activity')
    outputs = {}
    for name in workflow.build_outputs(workspace, package, agents) + ['.local/plugin.js']:
        expected = members['plugin.js'] if name == '.local/plugin.js' else members[name]
        path = workspace / name
        if workflow.regular(path) != expected:
            raise BuildError(f'Build output differs from verified ZIP: {name}')
        outputs[name] = {'path': str(path), 'sha256': workflow.digest(expected)}
    return {'archive': str(archive), 'archive_sha256': archive_hash, 'outputs': outputs,
            'journal': str(journal_path), 'journal_sha256': workflow.digest(journal_bytes)}


def _candidate_inputs(storage, selection, version, run):
    base, values, checks, task_checks = _combine(storage, selection, run)
    if version == selection['base']['version']:
        raise BuildError('Candidate version equals the selected base version')
    _set_version(values, version)
    inputs = _file_hashes(values)
    inputs_hash = workflow.inputs_hash(inputs)
    reviewed = selection.get('reviewed_inputs_sha256')
    changed_tools = [name for name in sorted(base.keys() | values.keys())
                     if name.startswith(('scripts/', 'verification/')) and base.get(name) != values.get(name)]
    if (reviewed is not None or changed_tools) and reviewed != inputs_hash:
        changed = ', '.join(changed_tools[:8]) or 'candidate inputs'
        raise BuildError(f'Review changed input files ({changed}); reviewed_inputs_sha256 must be {inputs_hash}')
    return values, inputs, inputs_hash, checks, task_checks


@_checked
def _prepare(project, state, selection, version, *, runner, tools=None):
    project = workflow.plain(project)
    state = _separate(project, state)
    version = _version(version)
    if not isinstance(selection, dict):
        raise BuildError('Invalid release selection')
    key = _hash(selection.get('key'), 'selection key')
    selection_hash = workflow.inputs_hash(selection)
    storage = workflow.plain(state / 'bases')
    builds = workflow.plain(state / 'builds')
    builds.mkdir(parents=True, exist_ok=True)
    run = workflow.plain(builds / (key[:8] + '-' + uuid4().hex[:12]))
    run.mkdir()
    try:
        values, inputs, inputs_hash, checks, task_checks = _candidate_inputs(storage, selection, version, run)
        workflow.trusted_project_inputs(inputs, _json(values['package.json'], 'package.json'))
        workspace = _workspace(run, inputs, values)
        workflow.unique_focus(workspace, checks)
        dependencies = {}
        if runner is _run_command:
            dependencies = _stage_esbuild(project, workspace, values)
            tools = {'npm': 'queue-manifest-command', 'node': workflow.tool('node'),
                     'python': sys.executable, 'pwsh': workflow.tool('pwsh')}
        owner = 'queue-' + uuid4().hex
        lock = workflow.lock_module(workspace)
        lock.change(workspace, 'acquire', owner, task='isolated accumulated release only')
        try:
            result = workflow.build_and_check(workspace, owner, workspace / '.local/run', checks, True,
                                              runner=runner, tools=tools)
            proof = _verified_outputs(workspace, version, checks, result)
            for name, expected in dependencies.items():
                _input_bytes(workspace, name, expected, frozen=True)
        finally:
            lock.change(workspace, 'release', owner, note='isolated build finished')
        saved = snapshot(workspace, storage, inputs_hash)
        if workflow.digest(workflow.regular(Path(proof['archive']))) != proof['archive_sha256']:
            raise BuildError('Verified ZIP changed before recording the result')
        receipt_path = run / 'result.json'
        receipt = dict(proof, version=version, checks=checks, task_checks=task_checks, snapshot=saved,
                       workspace=str(workspace), selection_key=key, selection_sha256=selection_hash,
                       receipt=str(receipt_path), esbuild_sha256=dependencies, test_only=runner is not _run_command)
        workflow.write_json(receipt_path, receipt)
        return receipt
    except (OSError, RuntimeError, TypeError, ValueError, subprocess.SubprocessError) as error:
        workflow.write_json(run / 'failed.json', {'selection_key': key, 'selection_sha256': selection_hash,
                                                 'version': version, 'error': str(error)})
        raise BuildError(f'{error} (details: {run})') from error


def prepare(project: Path, state: Path, selection: dict, version: str) -> dict:
    """Build the exact selection and return a receipt only with complete proof."""
    return _prepare(project, state, selection, version, runner=_run_command)


def _recover_run(run, storage, selection, key, selection_hash, version):
    run = workflow.plain(run)
    receipt_path = run / 'result.json'
    receipt = _json(workflow.regular(receipt_path), 'build result')
    if (receipt.get('selection_key') != key or receipt.get('selection_sha256') != selection_hash
            or receipt.get('version') != version or receipt.get('test_only') is not False
            or receipt.get('receipt') != str(receipt_path) or (run / 'failed.json').exists()):
        return None
    workspace = workflow.plain(run / '.local/workspace')
    if receipt.get('workspace') != str(workspace) or workflow.require_isolated_workspace(workspace) != run:
        return None
    _, inputs, id, checks, task_checks = _candidate_inputs(storage, selection, version, run)
    identity = {'id': id, 'version': version}
    if (receipt.get('snapshot') != identity or receipt.get('checks') != checks
            or receipt.get('task_checks') != task_checks):
        return None
    if _fingerprint(workspace) != dict(identity, files=inputs):
        return None
    if _open_base(storage / id, id)[1] != identity:
        return None
    journal = _json(workflow.regular(workspace / '.local/run/run.json'), 'verification journal')
    if journal.get('inherited_test_flags_sha256') != workflow.test_flag_hashes(os.environ):
        return None
    proof = _verified_outputs(workspace, version, checks, journal)
    if any(receipt.get(name) != value for name, value in proof.items()):
        return None
    dependencies = receipt.get('esbuild_sha256')
    if not isinstance(dependencies, dict) or not {
            'node_modules/esbuild/package.json', 'node_modules/esbuild/lib/main.js'} <= dependencies.keys():
        return None
    for name, expected in dependencies.items():
        if not re.fullmatch(r'node_modules/(?:esbuild/(?:package\.json|lib/main\.js)|'
                            r'@esbuild/[a-z0-9]+-[a-z0-9]+/(?:package\.json|esbuild\.exe|bin/esbuild))', name):
            return None
        _input_bytes(workspace, name, _hash(expected, name), frozen=True)
    return receipt


def recover_prepared(state: Path, selection: dict, version: str) -> dict | None:
    """Recover a finished production receipt without rebuilding or running tests."""
    if not isinstance(selection, dict):
        return None
    invalid = (OSError, RuntimeError, TypeError, ValueError, KeyError, AttributeError)
    try:
        version = _version(version)
        key = _hash(selection.get('key'), 'selection key')
        selection_hash = workflow.inputs_hash(selection)
        state = workflow.plain(state)
        builds = workflow.plain(state / 'builds')
        runs = sorted(builds.glob(key[:8] + '-*'), reverse=True)
    except invalid:
        return None
    for run in runs:
        if not re.fullmatch(key[:8] + r'-[0-9a-f]{12}', run.name):
            continue
        try:
            receipt = _recover_run(run, state / 'bases', selection, key, selection_hash, version)
        except invalid:
            continue
        if receipt is not None:
            return receipt
    return None
