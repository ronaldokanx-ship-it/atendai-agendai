 param($m) if ($m.Value -notmatch "import os") { "import os`n" + $m.Value } else { $m.Value } 
token = os.environ.get('VERCEL_TOKEN', '')  # Set VERCEL_TOKEN env var
teamId = 'team_bRwOBgpnXfuJ9dTIUg2PxzNQ'
# Commit novo: 6b49904
target_commit = '6b49904'

for attempt in range(24):
    req = urllib.request.Request(
        f'https://api.vercel.com/v6/deployments?teamId={teamId}&projectId=atendai_agendai&limit=5',
        headers={'Authorization': f'Bearer {token}'}
    )
    d = json.loads(urllib.request.urlopen(req).read())
    deps = d.get('deployments', [])
    for dep in deps:
        meta = dep.get('meta', {})
        git_sha = meta.get('githubCommitSha', '')
        state = dep.get('readyState', dep.get('state'))
        uid = dep.get('uid')
        url = dep.get('url')
        if target_commit in git_sha:
            print(f'[{attempt*5}s] NOVO uid={uid} state={state} url={url}')
            if state in ('READY', 'ERROR', 'CANCELED'):
                print('Build finalizado!')
            break
    else:
        # Mostra mais recente
        if deps:
            latest = deps[0]
            state = latest.get('readyState', latest.get('state'))
            sha = latest.get('meta', {}).get('githubCommitSha', 'N/A')[:8]
            print(f'[{attempt*5}s] aguardando... latest sha={sha} state={state}')
        time.sleep(5)
        continue
    if state in ('READY', 'ERROR', 'CANCELED'):
        break
    time.sleep(5)
