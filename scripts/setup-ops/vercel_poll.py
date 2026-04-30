 param($m) if ($m.Value -notmatch "import os") { "import os`n" + $m.Value } else { $m.Value } 
token = os.environ.get('VERCEL_TOKEN', '')  # Set VERCEL_TOKEN env var
teamId = 'team_bRwOBgpnXfuJ9dTIUg2PxzNQ'

# Aguarda o Vercel criar um novo deployment para o commit 6b49904
for attempt in range(20):
    req = urllib.request.Request(
        f'https://api.vercel.com/v6/deployments?teamId={teamId}&projectId=atendai_agendai&limit=5',
        headers={'Authorization': f'Bearer {token}'}
    )
    d = json.loads(urllib.request.urlopen(req).read())
    deps = d.get('deployments', [])
    if deps:
        latest = deps[0]
        state = latest.get('readyState', latest.get('state'))
        uid = latest.get('uid')
        url = latest.get('url')
        created = latest.get('createdAt', 0)
        print(f'[{attempt*5}s] uid={uid} state={state} url={url}')
        if state in ('READY', 'ERROR', 'CANCELED'):
            print('Finalizado!')
            break
    time.sleep(5)
