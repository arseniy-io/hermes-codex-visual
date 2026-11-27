"""Check the packaged helper bytes and import them through a staged Hermes companion."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
core = Path(os.environ['LOCALAPPDATA']) / 'hermes/hermes-agent'
source = ROOT / 'source/hermes-model-speed'
spec = importlib.util.spec_from_file_location('hcv_staged_bridge',
    ROOT / 'scripts/stage-hermes-model-speed.py')
stager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stager)
manifest = json.loads((source / 'manifest.json').read_text(encoding='utf8'))
asset = manifest['additional_helpers'][0]
path = asset['target']
original, staged = stager.combined_candidates(core)
assert hashlib.sha256(staged[path]).hexdigest() == asset['candidate']
assert staged[path] == (source / asset['source']).read_bytes()
assert (core / path).read_bytes() == original[path]
assert hashlib.sha256(original[path]).hexdigest() in (asset['baseline'], asset['candidate'])
scope = {}
exec(compile(staged[path], path, 'exec'), scope)
assert callable(scope['install_live_bridge'])
print('PASS package bridge stages and imports against the trusted installed core without editing it')
