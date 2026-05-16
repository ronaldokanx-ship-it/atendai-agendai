#!/usr/bin/env python3
"""Seed dados da clínica demo via API REST."""
import subprocess, json, os

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
        return {"raw": r.stdout[:300]}

# 1. Login
res = api("POST", "/auth/login", {"email": "admin@kanxitsolutions.com.br", "password": os.environ["ADMIN_PASSWORD"]})
token = res.get("token")
print(f"Token: {'OK' if token else 'FALHOU'}")

# 2. Registrar clínica demo
print("\n=== Criando clínica demo ===")
clinic = api("POST", "/auth/register", {
    "companyName": "ClinicAI Demo",
    "clinicType": "medica",
    "ownerName": "Owner Demo",
    "email": "owner@clinicai.com.br",
    "password": os.environ["OWNER_PASSWORD"]
})
print(json.dumps(clinic, indent=2, ensure_ascii=False)[:500])

clinic_token = clinic.get("token")
clinic_id = clinic.get("clinicId")
print(f"Clinic ID: {clinic_id}, Token: {'OK' if clinic_token else 'FALHOU'}")

if not clinic_token:
    print("Tentando login como owner...")
    res2 = api("POST", "/auth/login", {"email": "owner@clinicai.com.br", "password": os.environ["OWNER_PASSWORD"]})
    clinic_token = res2.get("token")
    clinic_id = res2.get("clinicId")
    print(f"Clinic ID: {clinic_id}, Token: {'OK' if clinic_token else 'FALHOU'}")

if not clinic_token or not clinic_id:
    print("ERRO: não foi possível criar/logar na clínica")
    exit(1)

# 3. Criar serviços
print(f"\n=== Criando serviços para clínica {clinic_id} ===")
services = [
    {"name": "Consulta Geral", "duration": 30, "price": 150.0, "description": "Consulta médica geral", "active": True},
    {"name": "Retorno", "duration": 20, "price": 80.0, "description": "Consulta de retorno", "active": True},
    {"name": "Avaliação Inicial", "duration": 60, "price": 200.0, "description": "Avaliação inicial completa", "active": True},
]
svc_ids = []
for svc in services:
    r = api("POST", f"/clinics/{clinic_id}/services", svc, token=clinic_token)
    sid = r.get("id")
    svc_ids.append(sid)
    print(f"  Serviço '{svc['name']}' -> ID={sid}")

# 4. Criar profissional
print(f"\n=== Criando profissional ===")
prof = api("POST", f"/clinics/{clinic_id}/professionals", {
    "name": "Dr. João Silva",
    "specialty": "Clínico Geral",
    "bio": "Médico clínico geral com 10 anos de experiência.",
    "active": True,
    "serviceIds": svc_ids,
    "schedules": [
        {"dayOfWeek": d, "startTime": "08:00", "endTime": "18:00", "active": True}
        for d in [1, 2, 3, 4, 5]
    ]
}, token=clinic_token)
print(f"  Profissional -> ID={prof.get('id')}")
print(json.dumps(prof, indent=2, ensure_ascii=False)[:300])

# 5. Atualizar configurações da clínica (evolutionInstanceName, apiKey)
print(f"\n=== Atualizando settings da clínica ===")
settings = api("PATCH", f"/clinics/{clinic_id}/settings", {
    "evolutionInstanceName": "clinica-1",
    "apiKey": "demo-api-key-clinic-001",
    "aiEnabled": True,
    "aiPrompt": "Você é uma assistente virtual de agendamentos da ClinicAI. Responda sempre em português do Brasil de forma cordial e profissional. Ajude os pacientes a agendar consultas, verificar disponibilidade e responder dúvidas frequentes sobre os serviços disponíveis."
}, token=clinic_token)
print(json.dumps(settings, indent=2, ensure_ascii=False)[:400])

print(f"\n✅ Seed concluído! Clínica ID={clinic_id}")
print(f"   Owner: owner@clinicai.com.br / <ver OWNER_PASSWORD env>")
