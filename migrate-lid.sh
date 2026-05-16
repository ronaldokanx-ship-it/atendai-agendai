#!/bin/bash
# Requer DATABASE_URL no ambiente — nunca commitar credenciais hardcoded!
# Exemplo: DATABASE_URL="postgresql://user:pass@host.neon.tech/dbname?sslmode=require" bash migrate-lid.sh
DB="${DATABASE_URL:?Variavel DATABASE_URL nao definida. Exporte antes de executar este script.}"

echo "=== Pacientes com possivel LID (14-15 digitos sem @) ==="
docker run --rm -e PGSSLMODE=require postgres:16-alpine psql "$DB" -c "SELECT id, phone, name, clinic_id FROM patients WHERE phone ~ '^[0-9]{14,15}$'"

echo ""
echo "=== AI logs com possivel LID ==="
docker run --rm -e PGSSLMODE=require postgres:16-alpine psql "$DB" -c "SELECT COUNT(*) as cnt, patient_phone FROM ai_logs WHERE patient_phone ~ '^[0-9]{14,15}$' GROUP BY patient_phone"

if [ "$1" == "--migrate" ]; then
  echo ""
  echo "=== Executando migracao ==="
  docker run --rm -e PGSSLMODE=require postgres:16-alpine psql "$DB" \
    -c "BEGIN; UPDATE patients SET phone = phone || '@lid' WHERE phone ~ '^[0-9]{14,15}$'; UPDATE ai_logs SET patient_phone = patient_phone || '@lid' WHERE patient_phone ~ '^[0-9]{14,15}$'; UPDATE handoffs SET patient_phone = patient_phone || '@lid' WHERE patient_phone ~ '^[0-9]{14,15}$'; UPDATE handoff_messages SET patient_phone = patient_phone || '@lid' WHERE patient_phone ~ '^[0-9]{14,15}$'; COMMIT;"
  echo "Migracao concluida!"
fi
