import subprocess, sys

key = subprocess.os.path.expanduser(r'~\.ssh\clinicai_oracle')
host = 'ubuntu@147.15.86.5'
ssh = ['ssh', '-i', key, '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15', host]

cmds = [
    "grep ALLOWED_ORIGINS /opt/clinicai/.env.prod || echo 'NAO ENCONTRADO'",
    r"""sed -i 's|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=https://atendaiagendai.vercel.app,https://atendaiagendai-kanxs-projects.vercel.app,https://kanxitsolutions.com.br|' /opt/clinicai/.env.prod""",
    "grep ALLOWED_ORIGINS /opt/clinicai/.env.prod",
    "cd /opt/clinicai && sudo docker compose -f docker-compose.vm1.yml up -d api 2>&1 | tail -3",
    "sleep 4 && curl -s http://localhost:3000/api/healthz",
]

for cmd in cmds:
    print(f'\n>>> {cmd[:80]}')
    r = subprocess.run(ssh + [cmd], capture_output=True, text=True, timeout=30)
    print(r.stdout.strip() or r.stderr.strip() or '(sem output)')
