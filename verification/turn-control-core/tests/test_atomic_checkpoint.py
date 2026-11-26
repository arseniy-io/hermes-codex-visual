import os,threading
from unittest.mock import patch
from tui_gateway.hcv_stop_tree import Checkpoints

def test_checkpoint_publication_survives_a_windows_reader_and_stays_atomic(tmp_path):
    store=Checkpoints(tmp_path)
    owner={'root_id':'root','profile_home':str(tmp_path)}
    old={'schema':1,'owner':owner,'state':'stopped'}
    new={**old,'state':'resumed'}
    store.write(old)
    reader=store.path(owner).open('r',encoding='utf-8')
    release=threading.Timer(.08,reader.close)
    release.start()
    try:
        store.write(new)
        assert store.read(owner)==new
    finally:
        reader.close();release.join()
    assert not list(tmp_path.glob('*.tmp'))

def test_persistent_rename_denial_keeps_previous_receipt_and_fails_closed(tmp_path):
    store=Checkpoints(tmp_path)
    owner={'root_id':'root','profile_home':str(tmp_path)}
    old={'schema':1,'owner':owner,'state':'stopped'}
    store.write(old)
    import tui_gateway.hcv_stop_tree as control
    with patch.object(control.os,'replace',side_effect=PermissionError('denied')) as replace, patch.object(control.time,'sleep'):
        try:
            store.write({**old,'state':'resumed'})
            assert False,'An unconfirmed receipt must not report success'
        except PermissionError:
            pass
        assert 1 < replace.call_count <= 100
    assert store.read(owner)==old
    assert not list(tmp_path.glob('*.tmp'))
