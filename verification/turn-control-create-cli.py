"""Create supported native CLI sessions inside the already-running isolated GUI owner."""
import asyncio,json,os,sys,time,uuid
from pathlib import Path
from urllib.parse import urlsplit
home=Path(os.environ['HERMES_HOME']).resolve(strict=True)
assert home.name=='hermes-home' and home.parent.name.startswith('hermes-e2e-codex-visual-')
url,workspace=sys.argv[1:]
p=urlsplit(url)
assert p.scheme=='http' and p.hostname=='127.0.0.1' and p.port and not p.username and not p.password
assert Path(workspace).resolve(strict=True).parent==home.parent
os.environ.pop('HERMES_TUI_GATEWAY_URL',None)
from hermes_cli.sessions_owner import live_owner
from hermes_cli.gateway_client import connect_gateway
async def main():
    endpoint=live_owner()
    assert endpoint is not None,'Existing isolated owner is required'
    created=[]
    async with connect_gateway(endpoint) as client:
        for title in ['Проверка CLI соседа','Проверка CLI дерева']:
            result=await client.rpc('session.create',_timeout=30,source='cli',provider='custom',
                base_url=url.rstrip('/')+'/v1',api_key='e2e-mock-key',model='mock-model',cwd=workspace,title=title)
            sid=result.get('session_id') or result.get('ref',{}).get('session_id')
            assert isinstance(sid,str) and sid
            ack=await client.rpc('prompt.submit',session_id=sid,text='HCV_FIXTURE_WARMUP',submission_id=uuid.uuid4().hex)
            deadline=time.monotonic()+40
            while True:
                receipt=await client.rpc('prompt.receipt',session_id=sid,admission_id=ack['admission_id'])
                if receipt['status']=='terminal':
                    assert receipt['outcome']=='completed',receipt['outcome']
                    break
                assert time.monotonic()<deadline,'CLI fixture warmup did not settle'
                await asyncio.sleep(.05)
            created.append({'session_id':sid,'title':title,'source':'cli'})
    print(json.dumps(created,ensure_ascii=True))
asyncio.run(main())
