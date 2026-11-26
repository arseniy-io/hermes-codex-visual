"""The Desktop clarify capability must not disable its regular queue actions."""
from types import SimpleNamespace

from gateway import session_queued_controls as controls


def test_desktop_plain_queue_with_clarify_capability_can_edit_and_steer():
    authority = SimpleNamespace(launch_sources={'local': 'gui', 'other': 'bot_room'})
    def actions(payload, source='local'):
        return controls.queued_controls(authority, {'target_session_id': source, 'status': 'queued',
            'payload': {'text': 'Move this queued message', 'cli_turn_v1': {'clarify_batch': True}, **payload}})

    assert actions({}) == ['steer', 'replace', 'reorder']
    for extra in ({'api_text': 'private context'}, {'model_override': {'model': 'test'}},
                  {'clarify_batch': False}, {'clarify_batch': 1}, {'turn_author': {'name': 'me'}}):
        assert actions({'cli_turn_v1': {**extra}}) == []
    for extra in ({'attachments_v1': {}}, {'native_text_v1': {}}, {'finite': True},
                  {'display_v1': {'kind': 'hidden'}}):
        assert actions(extra) == []
    assert actions({}, 'other') == []


if __name__ == '__main__':
    test_desktop_plain_queue_with_clarify_capability_can_edit_and_steer()
