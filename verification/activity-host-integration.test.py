"""Exercise the real Hermes plugin manager and HTTP mount in a disposable home."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
CORE = Path(os.environ['LOCALAPPDATA']) / 'hermes' / 'hermes-agent'
SOURCE = Path(os.environ.get('HCV_ACTIVITY_BACKEND_SOURCE', ROOT / 'source/usage-backend'))

class ActivityHostTest(unittest.TestCase):
    def test_native_plugin_hook_and_dashboard_apply(self):
        with tempfile.TemporaryDirectory(prefix='hcv-activity-host-') as temp:
            sandbox = Path(temp).resolve()
            home = sandbox / 'home'
            plugin = home / 'plugins' / 'hermes-codex-visual'
            plugin.parent.mkdir(parents=True)
            shutil.copytree(SOURCE, plugin, ignore=shutil.ignore_patterns('__pycache__'))
            (home / 'config.yaml').write_text(
                'plugins:\n  enabled:\n    - hermes-codex-visual\nskills:\n  write_approval: true\n'
                'memory:\n  write_approval: true\n  memory_enabled: true\n  user_profile_enabled: true\n', encoding='utf-8')
            env = os.environ.copy()
            env.update(HERMES_HOME=str(home), PYTHONPATH=str(CORE), LOCALAPPDATA=str(sandbox/'local'),
                       APPDATA=str(sandbox/'roaming'), USERPROFILE=str(sandbox),
                       HERMES_DISABLE_LAZY_INSTALLS='1', PYTHONDONTWRITEBYTECODE='1')
            program = r'''
from pathlib import Path
import json,sys
from hermes_constants import get_hermes_home
from hermes_cli.plugins import get_plugin_manager
from hermes_cli.web_server_dashboard import _discover_dashboard_plugins, _mount_one_plugin_api
from fastapi import FastAPI
from fastapi.testclient import TestClient
from tools import write_approval as wa
from agent.background_review import _action_lines, _classify_review_result
from model_tools import _apply_transform_tool_result_hook, _CallIds
import agent.oneshot
agent.oneshot.run_oneshot=lambda **kwargs: 'Проверить тестовое правило и сохранить результат.'
home=Path(sys.argv[1]).resolve()
assert get_hermes_home().resolve()==home
manager=get_plugin_manager()
manager.discover_and_load()
p=manager._plugins.get('hermes-codex-visual')
assert p and p.enabled and not p.error,(p and p.error)
skill=home/'skills'/'activity-host-skill'/'SKILL.md'
skill.parent.mkdir(parents=True)
skill.write_text('---\nname: activity-host-skill\ndescription: Native fixture\n---\n# Fixture\nBefore.\n',encoding='utf-8')
rec=wa.stage_write('skills',{'action':'patch','name':'activity-host-skill','old_string':'Before.','new_string':'After.'},summary='Native patch',origin='background_review')
raw=json.dumps({'success':True,'staged':True,'pending_id':rec['id'],'message':'Staged for approval.'})
assert _action_lines(json.loads(raw),{'tool':'skill_manage'},False)==[]
changed=_apply_transform_tool_result_hook('skill_manage',{},raw,0,_CallIds(session_id='isolated-native-hook'))
assert json.loads(changed).get('proposal_staged') is True,changed
actions=_action_lines(json.loads(changed),{'tool':'skill_manage'},False)
assert actions and _classify_review_result(actions)=='skill',actions
discovered=_discover_dashboard_plugins(search_dirs=[(home/'plugins','user')])
entry=next(x for x in discovered if x['name']=='hermes-codex-visual')
app=FastAPI()
assert _mount_one_plugin_api(app,entry,{'hermes-codex-visual'},set())
c=TestClient(app)
base='/api/plugins/hermes-codex-visual'
listing=c.get(base+'/activity')
assert listing.status_code==200,listing.text
data=listing.json();assert len(data['items'])==1,data
detail=c.get(base+'/activity/skills/'+rec['id'])
assert detail.status_code==200,detail.text
d=detail.json();assert d['applicable'] and 'Before.' in d['preview'] and 'After.' in d['preview'],d
body={k:d[k] for k in ('scope','version','signature')}
r=c.post(base+'/activity/skills/'+rec['id']+'/approve',json=body)
assert r.status_code==200 and r.json()['status']=='approved',r.text
assert 'After.' in skill.read_text(encoding='utf-8')
again=c.post(base+'/activity/skills/'+rec['id']+'/approve',json=body)
assert again.status_code==409,again.text
assert c.get(base+'/activity').json()['items']==[]
manager.unload()
print('native activity host passed')
'''
            result = subprocess.run([sys.executable, '-B', '-c', program, str(home)], cwd=CORE,
                                    env=env, capture_output=True, text=True, timeout=60)
            self.assertEqual(result.returncode, 0, result.stderr[-6000:]+result.stdout[-3000:])
            self.assertIn('native activity host passed', result.stdout)

if __name__ == '__main__':
    unittest.main()
