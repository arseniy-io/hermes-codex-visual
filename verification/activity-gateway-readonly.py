"""Probe the current profile's activity API without approving any proposal."""
import hashlib
import json
from urllib.parse import urlparse

import httpx
from gateway.control_socket import identify_gateway, query_gateway_control
from hermes_constants import get_hermes_home

home = get_hermes_home().resolve()
gateway = identify_gateway(home)
if not gateway:
    raise SystemExit('Local Hermes gateway was not found')
origin = gateway.get('api_origin') or ''
parsed = urlparse(origin)
if parsed.scheme != 'http' or parsed.hostname not in {'127.0.0.1', '::1', 'localhost'}:
    raise SystemExit('Refusing a non-local gateway')

def get(path):
    grant = query_gateway_control(home, 'session-ticket', params={
        'profile_id': str(home), 'instance_id': gateway['instance_id'], 'purpose': 'native-http',
    })
    if not grant or not grant.get('ticket'):
        raise SystemExit('Local read grant was not issued')
    try:
        with httpx.Client(timeout=15, trust_env=False, follow_redirects=False) as client:
            response = client.get(origin.rstrip('/') + path, headers={'X-Hermes-Gateway-Ticket': grant['ticket']})
            if response.status_code != 200:
                raise SystemExit(f'Activity endpoint returned HTTP {response.status_code}')
            return response.json()
    except httpx.HTTPError:
        raise SystemExit('Local Hermes endpoint did not respond') from None

base = '/api/plugins/hermes-codex-visual/activity'
listing = get(base + '?profile=default')
assert listing.get('schema') == 1 and listing.get('scope')
items = listing.get('items')
assert isinstance(items, list)
details = []
for item in items:
    detail = get(base + '/' + item['kind'] + '/' + item['id'] + '?profile=default')
    assert detail['scope'] == listing['scope'] and detail['version'] == item['version']
    details.append({'id': item['id'], 'kind': item['kind'], 'applicable': detail['applicable'],
                    'preview_bytes': len(detail['preview'].encode('utf-8'))})
pending = {str(p.relative_to(home)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest()
           for kind in ('skills', 'memory') for p in (home/'pending'/kind).glob('*.json')}
print(json.dumps({'schema': 1, 'count': len(items), 'invalid_count': listing['invalid_count'],
                  'details': details, 'pending_sha256': pending}, ensure_ascii=False))
