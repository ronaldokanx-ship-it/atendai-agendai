 param($m) if ($m.Value -notmatch "import os") { "import os`n" + $m.Value } else { $m.Value } 
token = os.environ.get('VERCEL_TOKEN', '')  # Set VERCEL_TOKEN env var
teamId = 'team_bRwOBgpnXfuJ9dTIUg2PxzNQ'
dep_id = 'dpl_87xdhnJEaR3nsEZKX7cZ2wnKgjHd'  # o READY original

req = urllib.request.Request(
    f'https://api.vercel.com/v2/deployments/{dep_id}/events?teamId={teamId}&limit=50',
    headers={'Authorization': f'Bearer {token}'}
)
events = json.loads(urllib.request.urlopen(req).read())
for ev in events:
    text = ev.get('text', ev.get('payload', {}).get('text', ''))
    if text:
        print(text)
