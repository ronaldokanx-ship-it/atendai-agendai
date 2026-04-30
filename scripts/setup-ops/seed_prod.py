#!/usr/bin/env python3
"""Seed dados da clínica demo no Neon PostgreSQL de produção."""
import subprocess, json, sys

# Connection string de produção (Neon)
DB_URL = "postgresql://neondb_owner:npg_5jZaUwytCbg4@ep-nameless-bread-acjpjdap.sa-east-1.aws.neon.tech/neondb?sslmode=require"

SQL = """
-- Clínica demo (ID=1)
INSERT INTO clinics (id, name, "evolutionInstanceName", "apiKey", "aiEnabled", "aiPrompt", "aiModel", phone, email, address)
VALUES (
  1,
  'ClinicAI Demo',
  'clinica-1',
  'demo-api-key-clinic-001',
  true,
  'Você é uma assistente virtual de agendamentos da ClinicAI Demo. Responda sempre em português do Brasil de forma cordial e profissional. Ajude os pacientes a agendar consultas, verificar disponibilidade e responder dúvidas frequentes.',
  NULL,
  NULL,
  'contato@clinicai.com.br',
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  "evolutionInstanceName" = EXCLUDED."evolutionInstanceName",
  "apiKey" = EXCLUDED."apiKey",
  "aiEnabled" = EXCLUDED."aiEnabled",
  "aiPrompt" = EXCLUDED."aiPrompt";

-- Serviços base
INSERT INTO services (id, "clinicId", name, duration, price, description, active)
VALUES
  (1, 1, 'Consulta Geral', 30, 150.00, 'Consulta médica geral', true),
  (2, 1, 'Retorno', 20, 80.00, 'Consulta de retorno', true),
  (3, 1, 'Avaliação Inicial', 60, 200.00, 'Avaliação inicial completa', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  duration = EXCLUDED.duration,
  price = EXCLUDED.price,
  active = EXCLUDED.active;

-- Profissional base
INSERT INTO professionals (id, "clinicId", name, specialty, active, bio)
VALUES
  (1, 1, 'Dr. João Silva', 'Clínico Geral', true, 'Médico clínico geral com 10 anos de experiência.')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  specialty = EXCLUDED.specialty,
  active = EXCLUDED.active;

-- Relação profissional-serviço
INSERT INTO professional_services ("professionalId", "serviceId")
VALUES (1, 1), (1, 2), (1, 3)
ON CONFLICT DO NOTHING;

-- Agenda do profissional (seg-sex 08:00-18:00)
INSERT INTO professional_schedules ("professionalId", "dayOfWeek", "startTime", "endTime", active)
VALUES
  (1, 1, '08:00', '18:00', true),
  (1, 2, '08:00', '18:00', true),
  (1, 3, '08:00', '18:00', true),
  (1, 4, '08:00', '18:00', true),
  (1, 5, '08:00', '18:00', true)
ON CONFLICT DO NOTHING;

-- Resetar sequences
SELECT setval('clinics_id_seq', (SELECT MAX(id) FROM clinics));
SELECT setval('services_id_seq', (SELECT MAX(id) FROM services));
SELECT setval('professionals_id_seq', (SELECT MAX(id) FROM professionals));
"""

result = subprocess.run(
    ['psql', DB_URL, '-c', SQL],
    capture_output=True, text=True
)

if result.returncode == 0:
    print("✅ Seed concluído com sucesso!")
    print(result.stdout)
else:
    print("❌ Erro:")
    print(result.stderr)
    sys.exit(1)
