 param($m) if ($m.Value -notmatch "import os") { "import os`n" + $m.Value } else { $m.Value } 
token = os.environ.get('VERCEL_TOKEN', '')  # Set VERCEL_TOKEN env var
teamId = 'team_bRwOBgpnXfuJ9dTIUg2PxzNQ'
dep_id = 'dpl_232ekFaxZMcCufQ7SPHDCXvhFrCT'

for i in range(12):
    req = urllib.request.Request(
        f'https://api.vercel.com/v13/deployments/{dep_id}?teamId={teamId}',
        headers={'Authorization': f'Bearer {token}'}
    )
    d = json.loads(urllib.request.urlopen(req).read())
    state = d.get('readyState', d.get('status'))
    url = d.get('url')
    print(f'[{i*10}s] state={state} url={url}')
    if state in ('READY', 'ERROR', 'CANCELED'):
        break
    time.sleep(10)
