#!/usr/bin/env python3
"""Seed completo: serviços, profissional e agenda para clínica ID=1."""
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

# 1. Login como owner da clínica
res = api("POST", "/auth/login", {"email": "owner@clinicai.com.br", "password": os.environ["OWNER_PASSWORD"]})
token = res.get("token")
clinic_id = res.get("clinicId")
print(f"Login: clinicId={clinic_id}, token={'OK' if token else 'FALHOU'}")
if not token:
    print(res)
    exit(1)

# 2. Criar serviços
print("\n=== Criando serviços ===")
service_data = [
    {"name": "Consulta Geral", "durationMinutes": 30, "price": 150.0, "description": "Consulta médica geral", "active": True},
    {"name": "Retorno", "durationMinutes": 20, "price": 80.0, "description": "Consulta de retorno", "active": True},
    {"name": "Avaliação Inicial", "durationMinutes": 60, "price": 200.0, "description": "Avaliação inicial completa", "active": True},
]
svc_ids = []
for svc in service_data:
    r = api("POST", f"/clinics/{clinic_id}/services", svc, token=token)
    sid = r.get("id")
    svc_ids.append(sid)
    print(f"  '{svc['name']}' -> ID={sid} | {r.get('error','')}")

# 3. Criar profissional com serviços
print("\n=== Criando profissional ===")
valid_ids = [i for i in svc_ids if i is not None]
prof = api("POST", f"/clinics/{clinic_id}/professionals", {
    "name": "Dr. João Silva",
    "specialty": "Clínico Geral",
    "bio": "Médico clínico geral com 10 anos de experiência.",
    "active": True,
    "serviceIds": valid_ids
}, token=token)
prof_id = prof.get("id")
print(f"  Profissional ID={prof_id} | {prof.get('error','')[:100]}")

# 4. Definir agenda (seg-sex 08:00-18:00)
if prof_id:
    print("\n=== Definindo agenda ===")
    # seg=1, ter=2, qua=3, qui=4, sex=5 | 08:00=480min, 18:00=1080min
    schedule_body = {
        "entries": [
            {"dayOfWeek": d, "startMinute": 480, "endMinute": 1080, "isBlock": False}
            for d in [1, 2, 3, 4, 5]
        ]
    }
    sched = api("PUT", f"/clinics/{clinic_id}/professionals/{prof_id}/schedule", schedule_body, token=token)
    print(f"  Agenda: {json.dumps(sched)[:200]}")

# 5. Atualizar evolutionInstanceName e aiEnabled via PATCH /clinics/:id
print("\n=== Atualizando settings da clínica ===")
upd = api("PATCH", f"/clinics/{clinic_id}", {
    "evolutionInstanceName": "clinica-1",
    "aiEnabled": True,
    "aiPrompt": "Você é uma assistente virtual de agendamentos da ClinicAI. Responda sempre em português do Brasil de forma cordial e profissional. Ajude os pacientes a agendar consultas, verificar disponibilidade e responder dúvidas frequentes sobre os serviços disponíveis."
}, token=token)
print(f"  Update: {json.dumps(upd)[:300]}")

print(f"\n✅ Seed concluído!")
print(f"   Clínica ID={clinic_id} | Serviços: {svc_ids} | Profissional: {prof_id}")
