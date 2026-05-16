import subprocess

key = r'C:\Users\Ronaldo\.ssh\clinicai_oracle'
ssh = ['ssh', '-i', key, '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15', 'ubuntu@147.15.86.5']

new_origins = 'https://atendai-kanx.vercel.app,https://kanxitsolutions.com.br'

cmds = [
    f"sed -i 's|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS={new_origins}|' /opt/clinicai/.env.prod",
    'grep ALLOWED_ORIGINS /opt/clinicai/.env.prod',
    'cd /opt/clinicai && sudo docker compose -f docker-compose.vm1.yml up -d api 2>&1 | tail -3',
    'sleep 3 && curl -s http://localhost:3000/api/healthz',
]

for cmd in cmds:
    print(f'>>> {cmd[:90]}')
    r = subprocess.run(ssh + [cmd], capture_output=True, text=True, timeout=30)
    print(r.stdout.strip() or r.stderr.strip() or '(ok)')
