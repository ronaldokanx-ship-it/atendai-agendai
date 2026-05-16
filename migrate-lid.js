// Migração LID phones via pg do api-server
const { Pool } = require('/app/lib/db/node_modules/pg');
const DATABASE_URL = process.env.DATABASE_URL;
const pool = new Pool({ connectionString: DATABASE_URL });

async function main() {
  const dryRun = process.argv[2] !== '--migrate';
  console.log(dryRun ? '=== Preview ===' : '=== Executando migração ===');

  const { rows: pts } = await pool.query(
    "SELECT id, phone, name, clinic_id FROM patients WHERE phone ~ '^[0-9]{14,15}$'"
  );
  console.log('Pacientes:', JSON.stringify(pts));

  const { rows: logs } = await pool.query(
    "SELECT COUNT(*) as cnt, \"patientPhone\" FROM ai_logs WHERE \"patientPhone\" ~ '^[0-9]{14,15}$' GROUP BY \"patientPhone\""
  );
  console.log('AI logs:', JSON.stringify(logs));

  if (dryRun) { await pool.end(); return; }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r1 = await client.query("UPDATE patients SET phone = phone || '@lid' WHERE phone ~ '^[0-9]{14,15}$'");
    console.log('patients:', r1.rowCount);
    const r2 = await client.query("UPDATE ai_logs SET \"patientPhone\" = \"patientPhone\" || '@lid' WHERE \"patientPhone\" ~ '^[0-9]{14,15}$'");
    console.log('ai_logs:', r2.rowCount);
    const r3 = await client.query("UPDATE handoffs SET \"patientPhone\" = \"patientPhone\" || '@lid' WHERE \"patientPhone\" ~ '^[0-9]{14,15}$'");
    console.log('handoffs:', r3.rowCount);
    const r4 = await client.query("UPDATE handoff_messages SET \"patientPhone\" = \"patientPhone\" || '@lid' WHERE \"patientPhone\" ~ '^[0-9]{14,15}$'");
    console.log('handoff_messages:', r4.rowCount);
    await client.query('COMMIT');
    console.log('DONE');
  } catch(e) { await client.query('ROLLBACK'); console.error('FAIL:', e.message); process.exit(1); }
  finally { client.release(); await pool.end(); }
}
main().catch(e => { console.error(e.message); process.exit(1); });
