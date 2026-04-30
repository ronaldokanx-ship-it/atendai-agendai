#!/usr/bin/env python3
"""Limpa profissional órfão ID=1 e verifica serviços do profissional ID=2."""
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
        return {"raw": r.stdout[:500]}

res = api("POST", "/auth/login", {"email": "owner@clinicai.com.br", "password": "ClinicOwner@2026!"})
token = res.get("token")
print(f"Login OK: {bool(token)}")

# Deletar profissional 1 órfão
print("\nDeletando profissional ID=1...")
d = api("DELETE", "/clinics/1/professionals/1", token=token)
print(json.dumps(d))

# Verificar profissional 2
print("\nGET profissional ID=2...")
p2 = api("GET", "/clinics/1/professionals/2", token=token)
print(json.dumps({k: v for k, v in p2.items() if k in ["id", "name", "specialty", "active"]}, ensure_ascii=False))

# Listar profissionais
print("\nLista profissionais:")
ps = api("GET", "/clinics/1/professionals", token=token)
if isinstance(ps, list):
    for p in ps:
        svc = p.get('serviceIds') or p.get('services') or 'sem info'
        print(f"  ID={p['id']} {p['name']} services={svc}")
else:
    print(json.dumps(ps)[:300])

# Listar serviços do profissional 2
print("\nServiços do profissional 2:")
svcs = api("GET", "/clinics/1/professionals/2/services", token=token)
print(json.dumps(svcs)[:200])
