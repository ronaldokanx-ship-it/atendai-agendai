 param($m) if ($m.Value -notmatch "import os") { "import os`n" + $m.Value } else { $m.Value } 
token = os.environ.get('VERCEL_TOKEN', '')  # Set VERCEL_TOKEN env var
teamId = 'team_bRwOBgpnXfuJ9dTIUg2PxzNQ'

req = urllib.request.Request(
    f'https://api.vercel.com/v6/deployments?projectId=atendai_agendai&teamId={teamId}&limit=3',
    headers={'Authorization': f'Bearer {token}'}
)
d = json.loads(urllib.request.urlopen(req).read())
for dep in d.get('deployments', []):
    print('state=' + dep['state'] + ' url=' + dep['url'] + ' uid=' + dep['uid'])
