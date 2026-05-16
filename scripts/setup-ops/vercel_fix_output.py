 param($m) if ($m.Value -notmatch "import os") { "import os`n" + $m.Value } else { $m.Value } 
token = os.environ.get('VERCEL_TOKEN', '')  # Set VERCEL_TOKEN env var
teamId = 'team_bRwOBgpnXfuJ9dTIUg2PxzNQ'

# Corrigir outputDirectory para dist/public
payload = json.dumps({
    'outputDirectory': 'dist/public',
    'buildCommand': None,   # deixa o Vercel detectar pelo package.json (pnpm run build)
    'installCommand': None  # deixa o Vercel usar pnpm install padrão
}).encode()

req = urllib.request.Request(
    f'https://api.vercel.com/v9/projects/atendai_agendai?teamId={teamId}',
    data=payload,
    headers={
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    },
    method='PATCH'
)
d = json.loads(urllib.request.urlopen(req).read())
print('outputDirectory:', d.get('outputDirectory'))
print('buildCommand:', d.get('buildCommand'))
print('framework:', d.get('framework'))

# Agora redeploy do deployment com build correto
payload2 = json.dumps({
    'deploymentId': 'dpl_87xdhnJEaR3nsEZKX7cZ2wnKgjHd',
    'name': 'atendai_agendai',
    'target': 'production'
}).encode()

req2 = urllib.request.Request(
    f'https://api.vercel.com/v13/deployments?teamId={teamId}',
    data=payload2,
    headers={
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    },
    method='POST'
)
d2 = json.loads(urllib.request.urlopen(req2).read())
print('\nNew deployment:', d2.get('id'))
print('url:', d2.get('url'))
