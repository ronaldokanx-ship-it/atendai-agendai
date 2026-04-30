#!/usr/bin/env python3
"""Verifica e faz seed dos dados da clínica demo via API REST."""
import subprocess, json

BASE = "http://localhost:3000/api"

def api(method, path, data=None, token=None):
    cmd = ['curl', '-s', '-X', method, BASE + path, '-H', 'Content-Type: application/json']
    if token:
        cmd += ['-H', f'Authorization: Bearer {token}']
    if data:
        cmd += ['-d', json.dumps(data)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return json.loads(r.stdout)
    except:
        return {"raw": r.stdout[:200]}

# 1. Login como superadmin
print("Fazendo login...")
res = api("POST", "/auth/login", {"email": "admin@kanxitsolutions.com.br", "password": "KlinicAdmin@2026!"})
print(json.dumps(res, indent=2, ensure_ascii=False)[:300])

token = res.get("token") or res.get("accessToken")
if not token:
    print("ERRO: sem token")
    exit(1)

# 2. Verificar clínicas existentes
print("\nClínicas existentes:")
clinics = api("GET", "/admin/clinics", token=token)
print(json.dumps(clinics, indent=2, ensure_ascii=False)[:500])
