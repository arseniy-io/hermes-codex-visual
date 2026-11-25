"""Build an isolated exact-module test overlay that survives native import hardening."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import uuid

ROOT = Path(__file__).resolve().parents[1]
BASE = Path(os.environ['LOCALAPPDATA']) / 'hermes/hermes-agent'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--candidate', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--manifest', type=Path, default=ROOT / 'source/hermes-timeline/manifest.json')
args = parser.parse_args()
SOURCE = args.candidate.resolve(strict=True)
OUT = args.output.resolve()
OUT.mkdir(parents=True, exist_ok=True)
MANIFEST = args.manifest.resolve(strict=True)
manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
overlay = OUT / ('exact-import-' + uuid.uuid4().hex[:10])
overlay.mkdir()
mapping = {}
targets = {name: entry['candidate'] for name, entry in manifest['files'].items() if name.endswith('.py')}
targets.update({entry['target']: entry['candidate'] for entry in manifest['helpers']})
for relative, expected in targets.items():
    raw = (SOURCE / relative).read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected:
        raise RuntimeError('The exact ZIP overlay source differs: ' + relative)
    target = overlay / 'modules' / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(raw)
    mapping[relative.removesuffix('.py').replace('/', '.')] = [str(target), expected]

trace = overlay / 'loaded-modules.jsonl'
customize = '''import hashlib
import importlib.abc
import importlib.machinery
import importlib.util
import json
import os
import sys

_BASE = {base!r}
_PINNED = {mapping!r}
_TRACE = {trace!r}
if _BASE not in sys.path:
    sys.path.append(_BASE)
sys.dont_write_bytecode = True

def _verify(name):
    path, expected = _PINNED[name]
    with open(path, 'rb') as handle:
        actual = hashlib.sha256(handle.read()).hexdigest()
    if actual != expected:
        raise SystemExit('Exact test core changed: ' + name)
    return path, expected

class _PinnedLoader(importlib.machinery.SourceFileLoader):
    def exec_module(self, module):
        path, expected = _verify(module.__name__)
        super().exec_module(module)
        raw = (json.dumps({{'pid': os.getpid(), 'module': module.__name__, 'file': path, 'sha256': expected}}, ensure_ascii=True) + '\\n').encode('utf-8')
        fd = os.open(_TRACE, os.O_CREAT | os.O_APPEND | os.O_WRONLY | getattr(os, 'O_BINARY', 0), 0o600)
        try:
            os.write(fd, raw)
        finally:
            os.close(fd)

class _PinnedFinder(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname not in _PINNED:
            return None
        filename, _ = _verify(fullname)
        return importlib.util.spec_from_file_location(fullname, filename, loader=_PinnedLoader(fullname, filename))

sys.meta_path.insert(0, _PinnedFinder())
import logging
_diagnostic = logging.FileHandler({diagnostic!r}, encoding='utf-8')
_diagnostic.setLevel(logging.ERROR)
logging.getLogger('gateway.session_authority').addHandler(_diagnostic)
'''.format(base=str(BASE), mapping=mapping, trace=str(trace), diagnostic=str(overlay / 'native-exceptions.log'))
(overlay / 'sitecustomize.py').write_text(customize, encoding='utf-8', newline='\n')
# Only the source-root discovery probe. Native hermes_cli remains the actual
# installed package; its bootstrap/import hardening is intentionally preserved.
(overlay / 'hermes_cli').mkdir()
(overlay / 'hermes_cli/main.py').write_text('# Exact fixture source-root probe.\n', encoding='utf-8')
result = {'overlay': str(overlay), 'source': str(SOURCE), 'trace': str(trace), 'modules': mapping}
(OUT / 'exact-import-overlay.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'overlay': str(overlay), 'trace': str(trace), 'moduleCount': len(mapping)}, ensure_ascii=False))
