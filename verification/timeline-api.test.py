"""Offline endpoint tests: bounded native DB seam, profile identity and no bodies."""
import copy
from contextlib import contextmanager
import importlib.util
import json
from pathlib import Path
import sys,tempfile,types,unittest
from unittest import mock

ROOT=Path(__file__).resolve().parent
class HTTPException(Exception):
 def __init__(self,status_code,detail):self.status_code=status_code;self.detail=detail;super().__init__(detail)
class Router:
 def get(self,*a,**k):return lambda fn:fn
fastapi=types.ModuleType('fastapi');fastapi.APIRouter=Router;fastapi.HTTPException=HTTPException
with mock.patch.dict(sys.modules,{'fastapi':fastapi}):
 spec=importlib.util.spec_from_file_location('timeline_api_test',ROOT.parent/'source/usage-backend/timeline.py');api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)

def timeline(phase='final',**extra):
 return {'hcv_timeline':{'version':1,'turnId':'native-turn','turnStartedAtMs':100000,'phase':phase,'opensExchange':True,
  **({'finalAssistantStartedAtMs':125000,'completedAtMs':200000} if phase=='final' else {}),**extra}}

class Endpoint(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='api-test-',dir=ROOT);self.home=Path(self.temp.name).resolve()
  self.assertTrue(self.home.is_relative_to(ROOT.resolve()))
  self.addCleanup(self.temp.cleanup)
  (self.home/'state.db').touch()
  self.calls=[];self.raw=[];self.sessions={'s':{'id':'s'}};self.canonical='s';self.current_home=self.home
  self.consistent=True;self.revision=0;self.unsupported=0
  case=self
  class DB:
   def __init__(self,path,read_only):case.calls.append(('open',Path(path),read_only))
   def __enter__(self):return self
   def __exit__(self,*a):case.calls.append(('close',))
   def get_session(self,sid):case.calls.append(('get_session',sid));return case.sessions.get(sid)
   def resolve_resume_session_id(self,sid):case.calls.append(('resolve',sid));return case.canonical
   def _resume_lineage_ids(self,sid):return [sid] if sid=='s' else ['s',sid]
   def _read_one(self,sql,args):
    return (len(case.raw), max((row['id'] for row in case.raw), default=0),
     sum(row['id']<=args[0] for row in case.raw), case.unsupported,case.revision)
   @contextmanager
   def transcript_read_snapshot(self):yield lambda:case.consistent
   def get_messages(self,sid,**kw):
    case.calls.append(('messages',sid,kw));return copy.deepcopy(case.raw[kw['offset']:kw['offset']+kw['limit']])
  constants=types.ModuleType('hermes_constants');constants.get_hermes_home=lambda:self.current_home
  state=types.ModuleType('hermes_state');state.SessionDB=DB
  compaction=types.ModuleType('agent.compaction_display');compaction.project_compaction_message_for_display=lambda row:row
  compressor=types.ModuleType('agent.context_compressor');compressor.user_originated_turn_view=lambda row:row if row.get('role')=='user' and row.get('display_kind') not in ('auto_continue','async_delegation_complete') else None
  self.modules=mock.patch.dict(sys.modules,{'hermes_constants':constants,'hermes_state':state,'agent.compaction_display':compaction,'agent.context_compressor':compressor})
  self.modules.start();self.addCleanup(self.modules.stop)
  self.display=mock.patch.object(api,'_display_rows',side_effect=lambda rows,home:rows);self.display.start();self.addCleanup(self.display.stop)
 def test_same_profile_readonly_exact_native_lineage_and_stable_row_ids(self):
  self.raw=[{'id':11,'message_uid':'stable','role':'user','timestamp':99.,'content':'ask','display_metadata':timeline('input')},
   {'id':12,'message_uid':'stable2','role':'assistant','timestamp':200.,'content':'done','display_metadata':timeline()}]
  value=api.read_turn_timeline('s')
  self.assertTrue(value['complete']);self.assertEqual(value['sessionId'],'s');self.assertEqual(len(value['rows']),2)
  self.assertEqual(value['rows'][0]['id'],11);self.assertEqual(value['rows'][0]['message_uid'],'stable')
  self.assertTrue(value['rows'][0]['isHumanUser']);self.assertTrue(value['rows'][1]['hasVisibleAssistantText'])
  self.assertEqual(self.calls[0],('open',self.home/'state.db',True))
  kw=next(call[2] for call in self.calls if call[0]=='messages');self.assertEqual(kw,{'include_compacted':True,'include_ancestors':True,'latest':False,'limit':401,'offset':0})
  self.assertEqual(self.calls[-1],('close',));self.assertNotIn(str(self.home),json.dumps(value))
 def test_response_never_contains_body_prompt_reasoning_tool_args_or_extra_metadata(self):
  self.raw=[{'id':1,'role':'assistant','content':'SECRET_CONTENT','reasoning':'SECRET_REASONING','system_prompt':'SECRET_SYSTEM',
   'tool_calls':[{'arguments':'SECRET_ARGUMENTS'}],'display_metadata':{**timeline(secret='SECRET_EXTRA'),'secret':'SECRET_META'}}]
  result=api.read_turn_timeline('s');encoded=json.dumps(result)
  self.assertNotIn('SECRET',encoded);self.assertNotIn('content',encoded);self.assertNotIn('reasoning',encoded);self.assertNotIn('arguments',encoded)
  self.assertEqual(result['rows'][0]['display_metadata']['hcv_timeline']['finalAssistantStartedAtMs'],125000)
 def test_json_metadata_preserves_clock_and_drops_invalid_floats_and_unknown_fields(self):
  self.raw=[{'id':1,'role':'assistant','content':'x','display_metadata':json.dumps(timeline(assistantStartedAtMs=float('nan'),unknown='DROP'))}]
  row=api.read_turn_timeline('s')['rows'][0];self.assertNotIn('assistantStartedAtMs',row['display_metadata']['hcv_timeline']);self.assertNotIn('unknown',json.dumps(row))
 def test_legacy_completion_timestamp_is_returned_separately_without_invented_start(self):
  self.raw=[{'id':1,'role':'assistant','content':'done','timestamp':200.}]
  row=api.read_turn_timeline('s')['rows'][0]
  self.assertEqual(row['timestamp'],200.);self.assertEqual(row['display_metadata'],{});self.assertTrue(row['hasVisibleAssistantText'])
 def test_native_interruption_flag_survives_without_copying_body_or_arbitrary_metadata(self):
  self.raw=[{'id':15,'role':'assistant','content':'SECRET_BODY','display_metadata':{'interrupted':True,'secret':'SECRET_META'}}]
  result=api.read_turn_timeline('s')
  self.assertEqual(result['rows'][0]['display_metadata'],{'interrupted':True})
  self.assertNotIn('SECRET',json.dumps(result))
 def test_boolean_version_is_not_numeric_version_one(self):
  value=timeline();value['hcv_timeline']['version']=True
  self.raw=[{'id':1,'role':'assistant','content':'x','display_metadata':value}]
  self.assertEqual(api.read_turn_timeline('s')['rows'][0]['display_metadata'],{})
 def test_compaction_gap_and_synthetic_input_are_distinct_from_human_user(self):
  self.raw=[{'id':1,'role':'system','content':'PRIVATE_COMPACTION','_compressed_summary':True},
   {'id':2,'role':'user','content':'machine','display_kind':'auto_continue'}]
  rows=api.read_turn_timeline('s')['rows'];self.assertEqual(rows[0]['row_kind'],'compaction');self.assertFalse(rows[0]['isHumanUser']);self.assertFalse(rows[1]['isHumanUser'])
 def test_visibility_respects_hidden_model_only_reasoning_images_and_display_override(self):
  self.raw=[{'id':1,'role':'assistant','content':'secret','display_kind':'hidden'},
   {'id':2,'role':'assistant','content':'secret','display_metadata':{'model_only':True}},
   {'id':3,'role':'assistant','content':'','reasoning':'secret'},
   {'id':4,'role':'assistant','content':[{'type':'image','image':'secret'}]},
   {'id':5,'role':'assistant','content':'raw','display_content':''},
   {'id':6,'role':'assistant','content':'','display_commentary':['visible']},
   {'id':7,'role':'assistant','content':[{'type':'text','text':'visible'}]}]
  self.assertEqual([row['hasVisibleAssistantText'] for row in api.read_turn_timeline('s')['rows']],[False,False,False,False,False,True,True])
 def test_native_display_projection_is_applied_with_pinned_owning_home(self):
  self.raw=[{'id':1,'role':'assistant','content':'raw secret'}]
  with mock.patch.object(api,'_display_rows',return_value=[{'id':1,'role':'assistant','content':'raw secret','display_content':''}]) as projector:
   result=api.read_turn_timeline('s')
  projector.assert_called_once();self.assertEqual(projector.call_args.args[1],self.home);self.assertFalse(result['rows'][0]['hasVisibleAssistantText'])
 def test_only_previously_typed_failure_boundaries_are_identified(self):
  self.raw=[
   {'id':1,'role':'assistant','display_kind':'failed_turn'},
   {'id':2,'role':'assistant'},
  ]
  def project(rows, home):
   return [{**row,'display_kind':'failed_turn'} for row in rows]
  with mock.patch.object(api,'_display_rows',side_effect=project):
   rows=api.read_turn_timeline('s')['rows']
  self.assertTrue(rows[0]['isStoredFailedTurn'])
  self.assertNotIn('isStoredFailedTurn',rows[1])
 def test_exact_missing_session_never_uses_prefix_or_queries_history(self):
  with self.assertRaises(HTTPException) as caught:api.read_turn_timeline('unknown-prefix')
  self.assertEqual(caught.exception.status_code,404);self.assertFalse(any(row[0]=='messages' for row in self.calls))
 def test_missing_profile_database_is_not_created(self):
  (self.home/'state.db').unlink()
  with self.assertRaises(HTTPException) as caught:api.read_turn_timeline('s')
  self.assertEqual(caught.exception.status_code,404);self.assertEqual(self.calls,[]);self.assertFalse((self.home/'state.db').exists())
 def test_profile_change_during_projection_discards_result(self):
  with mock.patch.object(api,'_display_rows',side_effect=lambda rows,home:(setattr(self,'current_home',self.home/'other') or rows)):
   with self.assertRaises(HTTPException) as caught:api.read_turn_timeline('s')
  self.assertEqual(caught.exception.status_code,409)
 def test_pagination_uses_scanned_count_and_complete_only_for_full_prefix(self):
  self.raw=[{'id':i,'role':'assistant','content':'x'} for i in range(3)]
  first=api.read_turn_timeline('s',limit=2)
  self.assertFalse(first['complete']);self.assertTrue(first['hasMore']);self.assertEqual(first['pagination']['nextOffset'],2)
  last=api.read_turn_timeline('s',offset=2,limit=2)
  self.assertFalse(last['complete']);self.assertFalse(last['hasMore']);self.assertEqual(last['pagination']['scanned'],1)
 def test_checkpoint_appends_suffix_and_restarts_when_the_prefix_is_unproven(self):
  self.raw=[{'id':i,'role':'assistant','content':'x'} for i in range(1,4)]
  first=api.read_turn_timeline('s',limit=2,incremental=True)
  last=api.read_turn_timeline('s',offset=2,limit=2,incremental=True)
  self.assertEqual(first['checkpoint'],last['checkpoint'])
  self.raw.append({'id':4,'role':'assistant','content':'y'})
  tail=api.read_turn_timeline('s',offset=3,limit=2,incremental=True,checkpoint=last['checkpoint'])
  self.assertTrue(tail['appended']);self.assertEqual([row['id'] for row in tail['rows']],[4])
  for flags in ({'revision':1}, {'unsupported':1}, {'consistent':False}):
   with mock.patch.multiple(self,**flags):
    restart=api.read_turn_timeline('s',offset=3,limit=2,incremental=True,checkpoint=last['checkpoint'])
    self.assertNotIn('appended',restart);self.assertEqual(restart['pagination']['offset'],0)
  self.sessions['tip']={'id':'tip'};self.canonical='tip'
  restart=api.read_turn_timeline('s',offset=3,limit=2,incremental=True,checkpoint=last['checkpoint'])
  self.assertNotIn('checkpoint',restart);self.assertEqual(restart['pagination']['offset'],0)
 def test_canonical_native_compression_tip_is_explicit_and_must_exist(self):
  self.sessions['tip']={'id':'tip'};self.canonical='tip';result=api.read_turn_timeline('s')
  self.assertEqual(result['requestedSessionId'],'s');self.assertEqual(result['sessionId'],'tip')
  self.canonical='missing'
  with self.assertRaises(HTTPException) as caught:api.read_turn_timeline('s')
  self.assertEqual(caught.exception.status_code,404)
 def test_receipt_helper_gets_only_this_readonly_db_and_body_fields_are_dropped(self):
  self.raw=[{'id':9,'role':'user','display_kind':'async_delegation_complete','content':'SECRET_RECEIPT'}]
  def projector(db,sid,rows,*,home):
   self.assertEqual(sid,'s');self.assertEqual(home,self.home);self.assertEqual(rows[0]['id'],9)
   return [{'row_id':9,'delegation_id':'deleg_x','content':'SECRET_RECEIPT','agents':[{'subagent_id':'worker','child_session_id':'child','task_name':'Saved name','goal':'SECRET_GOAL','task_index':0}]}]
  result=api.read_turn_timeline('s',receipt_projector=projector)
  self.assertEqual(result['receipts'][0]['agents'][0]['task_name'],'Saved name');self.assertNotIn('SECRET',json.dumps(result))
 def test_bad_parameters_rejected_before_db_open(self):
  for args in [('',0,400),('s',-1,400),('s',0,501),('s',True,400),('s',0,False),('x\0',0,400),('s',50001,1)]:
   with self.assertRaises(HTTPException) as caught:api.read_turn_timeline(*args)
   self.assertEqual(caught.exception.status_code,422)
  self.assertEqual(self.calls,[])
 def test_internal_error_does_not_echo_path_or_private_data(self):
  with mock.patch.object(api,'_display_rows',side_effect=RuntimeError('SECRET_PATH_AND_TOKEN')):
   with self.assertRaises(HTTPException) as caught:api.read_turn_timeline('s')
  self.assertEqual(caught.exception.status_code,503);self.assertNotIn('SECRET',caught.exception.detail)

if __name__=='__main__':unittest.main(verbosity=2)
