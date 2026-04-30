 param($m) if ($m.Value -notmatch "import os") { "import os`n" + $m.Value } else { $m.Value } 
token = os.environ.get('VERCEL_TOKEN', '')  # Set VERCEL_TOKEN env var
teamId = 'team_bRwOBgpnXfuJ9dTIUg2PxzNQ'

# Redeploy do último deployment READY com as novas configurações
payload = json.dumps({
    'deploymentId': 'dpl_87xdhnJEaR3nsEZKX7cZ2wnKgjHd',
    'name': 'atendai_agendai',
    'target': 'production'
}).encode()

req = urllib.request.Request(
    f'https://api.vercel.com/v13/deployments?teamId={teamId}',
    data=payload,
    headers={
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    },
    method='POST'
)
try:
    d = json.loads(urllib.request.urlopen(req).read())
    print('New deployment uid:', d.get('id'))
    print('url:', d.get('url'))
    print('state:', d.get('readyState'))
except Exception as e:
    print('Erro:', e)
