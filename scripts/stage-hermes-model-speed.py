"""Stage the exact version-pinned Hermes model-speed companion."""
from pathlib import Path
import argparse
import importlib.util

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('hcv_stage_base', ROOT / 'scripts/stage-hermes-tool-display.py')
stage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage)
stage.ASSETS = ROOT / 'source/hermes-model-speed'
stage.OUT = ROOT / '.local/hermes-model-speed-check/candidate'

# Extra helpers are checked with the same pinned and no-overwrite rules.
import ast
import json
_base_candidates = stage.candidates
def combined_candidates(core=stage.CORE):
    manifest = json.loads((stage.ASSETS / 'manifest.json').read_text(encoding='utf8'))
    baseline = manifest['helper'].get('baseline')
    if not isinstance(baseline, str) or len(baseline) != 64 or any(c not in '0123456789abcdef' for c in baseline):
        raise RuntimeError('Invalid model-speed helper baseline')
    originals, output = _base_candidates(core, helper_baselines=(baseline,))
    helpers = manifest.get('additional_helpers')
    if not isinstance(helpers, list) or len(helpers) != 1:
        raise RuntimeError('Invalid combined companion helper manifest')
    for helper in helpers:
        if set(helper) != {'source', 'target', 'candidate', 'baseline'}:
            raise RuntimeError('Invalid combined companion helper entry')
        baseline = helper['baseline']
        if not isinstance(baseline, str) or len(baseline) != 64 or any(c not in '0123456789abcdef' for c in baseline):
            raise RuntimeError('Invalid combined companion helper entry')
        raw = (stage.ASSETS / stage.safe_relative(helper['source'])).read_bytes()
        if stage.digest(raw) != helper['candidate']:
            raise RuntimeError('The combined helper changed')
        ast.parse(raw.decode('utf8'), filename=helper['target'])
        target = stage.checked_path(core, helper['target'], exists=False)
        if target.exists():
            original = target.read_bytes()
            if stage.digest(original) not in {baseline, helper['candidate']}:
                raise RuntimeError('A different combined helper is already installed')
            originals[helper['target']] = original
        output[helper['target']] = raw
    return originals, output
stage.candidates = combined_candidates


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=stage.OUT)
    args = parser.parse_args()
    _, files = stage.write_candidate(args.out)
    print('Staged', len(files), 'exact Hermes files; installed Hermes was not changed.')


if __name__ == '__main__':
    main()
