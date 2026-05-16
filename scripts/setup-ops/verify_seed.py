#!/usr/bin/env python3
import subprocess, json

TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjIsImNsaW5pY0lkIjoxLCJyb2xlIjoib3duZXIiLCJuYW1lIjoiT3duZXIgRGVtbyIsImlhdCI6MTc3NzU3OTY0MywiZXhwIjoxNzc4MTg0NDQzfQ.uiTvu40WtN2DyKkSixQ8QGY4MiX71KuoXRltyEr_wS0"
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

# Verificar clínica
clinic = api("GET", "/clinics/1", token=TOKEN)
print("evolutionInstanceName:", clinic.get("evolutionInstanceName"))
print("aiEnabled:", clinic.get("aiEnabled"))
print("apiKey:", clinic.get("apiKey"))

# Vincular serviços ao profissional 2 (criado nesta sessão)
print("\nVinculando serviços ao profissional 2...")
r = api("PUT", "/clinics/1/professionals/2/services", {"serviceIds": [1, 2, 3]}, token=TOKEN)
print(json.dumps(r)[:200])

# Verificar profissionais
profs = api("GET", "/clinics/1/professionals", token=TOKEN)
print("\nProfissionais:")
for p in (profs if isinstance(profs, list) else []):
    print(f"  ID={p.get('id')} {p.get('name')} services={p.get('serviceIds')}")
