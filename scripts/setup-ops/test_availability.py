#!/usr/bin/env python3
"""Verifica vinculação de serviços e disponibilidade."""
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

# Vincular serviços ao profissional 2
print("Vinculando serviços 1,2,3 ao profissional 2...")
upd = api("PUT", "/clinics/1/professionals/2/services", {"serviceIds": [1, 2, 3]}, token=token)
print(json.dumps({k: v for k, v in upd.items() if k in ["id", "name", "serviceIds", "error"]}, ensure_ascii=False))

# Testar disponibilidade
print("\nTestando disponibilidade (2026-04-30, serviço 1):")
avail = api("GET", "/clinics/1/appointments/availability?date=2026-04-30&serviceId=1", token=token)
print(json.dumps(avail)[:400])
