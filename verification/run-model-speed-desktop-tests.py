"""Run the real owner handlers against a staged core and disposable fake accounts."""
from pathlib import Path
import argparse
import importlib.util
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--python', default=os.environ.get('HERMES_VISUAL_PYTHON') or sys.executable,
                    help='Python with Hermes dependencies, pytest and pytest-asyncio')
parser.add_argument('--hermes-core', default=str(Path(os.environ.get('LOCALAPPDATA', '')) / 'hermes/hermes-agent'))
parser.add_argument('--pytest-path', default=os.environ.get('HCV_PYTEST_PATH', ''),
                    help='Optional path containing pytest and pytest-asyncio')
args = parser.parse_args()
installed = Path(args.hermes_core).resolve(strict=True)
python = Path(args.python).resolve(strict=True)

spec = importlib.util.spec_from_file_location('hcv_test_stage', ROOT / 'scripts/stage-hermes-model-speed.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

with tempfile.TemporaryDirectory(prefix='hcv-model-speed-desktop-') as temp:
    sandbox = Path(temp)
    staged = sandbox / 'candidate'
    test_copy = sandbox / 'model_speed_desktop_test.py'
    shutil.copyfile(ROOT / 'verification/model_speed_desktop_test.py', test_copy)
    module.stage.write_candidate(staged, installed)
    for name in ('temp', 'local', 'roaming', 'codex', 'home'):
        (sandbox / name).mkdir()
    keys = ('SYSTEMROOT', 'WINDIR', 'SYSTEMDRIVE', 'COMSPEC', 'PATHEXT', 'PATH',
            'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE')
    env = {key: os.environ[key] for key in keys if key in os.environ}
    python_paths = [str(installed)]
    if args.pytest_path:
        python_paths.insert(0, str(Path(args.pytest_path).resolve(strict=True)))
    env.update(LOCALAPPDATA=str(sandbox / 'local'), APPDATA=str(sandbox / 'roaming'),
               USERPROFILE=str(sandbox / 'home'), TEMP=str(sandbox / 'temp'), TMP=str(sandbox / 'temp'),
               HERMES_HOME=str(sandbox / 'home'), CODEX_HOME=str(sandbox / 'codex'),
               HCV_INSTALLED_HERMES=str(installed), HCV_STAGED_CORE=str(staged), HCV_MODEL_SPEED_PROJECT=str(ROOT),
               PYTHONPATH=os.pathsep.join(python_paths), PYTEST_DISABLE_PLUGIN_AUTOLOAD='1',
               PYTHONDONTWRITEBYTECODE='1')
    cmd = [str(python), '-X', 'utf8', '-B', '-m', 'pytest', '-p', 'pytest_asyncio.plugin', '-p', 'tests.conftest',
           '-q', '--tb=short', '-p', 'no:cacheprovider', str(test_copy)]
    raise SystemExit(subprocess.call(cmd, cwd=sandbox, env=env))
