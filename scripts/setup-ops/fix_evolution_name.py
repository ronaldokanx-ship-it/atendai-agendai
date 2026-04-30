#!/usr/bin/env python3
"""Força atualização do evolutionInstanceName e verifica resultado."""
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

# Login fresh
res = api("POST", "/auth/login", {"email": "owner@clinicai.com.br", "password": "ClinicOwner@2026!"})
token = res.get("token")
print(f"Login OK: {bool(token)}")

# PATCH com só evolutionInstanceName
print("\nPATCH evolutionInstanceName...")
upd = api("PATCH", "/clinics/1", {"evolutionInstanceName": "clinica-1"}, token=token)
print(json.dumps({k: v for k, v in upd.items() if k in ["id", "name", "evolutionInstanceName", "aiEnabled", "error"]}, ensure_ascii=False))

# GET para confirmar
print("\nGET /clinics/1...")
c = api("GET", "/clinics/1", token=token)
print(json.dumps({k: v for k, v in c.items() if k in ["id", "name", "evolutionInstanceName", "aiEnabled", "apiKey"]}, ensure_ascii=False))

# Status WhatsApp
print("\nStatus WhatsApp:")
ws = api("GET", "/clinics/1/whatsapp/status", token=token)
print(json.dumps(ws))
