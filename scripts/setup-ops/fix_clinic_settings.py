#!/usr/bin/env python3
"""Finaliza configuração da clínica: evolutionInstanceName + apiKey."""
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

# Login owner
res = api("POST", "/auth/login", {"email": "owner@clinicai.com.br", "password": "ClinicOwner@2026!"})
token = res.get("token")
print(f"Login: {'OK' if token else 'FALHOU'}")

# PATCH para salvar evolutionInstanceName
print("\nAtualizando evolutionInstanceName...")
upd = api("PATCH", "/clinics/1", {
    "evolutionInstanceName": "clinica-1",
    "aiEnabled": True,
    "aiPrompt": "Você é uma assistente virtual de agendamentos da ClinicAI. Responda sempre em português do Brasil de forma cordial e profissional. Ajude os pacientes a agendar consultas, verificar disponibilidade e responder dúvidas frequentes sobre os serviços disponíveis."
}, token=token)
print("evolutionInstanceName:", upd.get("evolutionInstanceName"))
print("aiEnabled:", upd.get("aiEnabled"))
print("error:", upd.get("error", "nenhum"))

# Verificar state do WhatsApp  
print("\nStatus WhatsApp:")
ws = api("GET", "/clinics/1/whatsapp/status", token=token)
print(json.dumps(ws)[:200])
