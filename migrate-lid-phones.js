// Migração: @lid patients phone fix
// Converte phones de 14-15 dígitos (LID) para formato com @lid suffix
const { Pool } = require('pg');
const fs = require('fs');
// Carregar .env manualmente
const envPath = 'C:\\Desenvolvimento\\Sistema-Sas\\.env';
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) process.env[m[1]] = m[2].trim();
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log('=== Preview da migração ===');
  
  // Pacientes com phone de 14-15 dígitos (padrão LID)
  const { rows: pts } = await pool.query(
    "SELECT id, phone, name, clinic_id FROM patients WHERE phone ~ '^[0-9]{14,15}$'"
  );
  console.log('Pacientes com LID:', pts);
  
  // ai_logs com patientPhone de 14-15 dígitos
  const { rows: logs } = await pool.query(
    "SELECT COUNT(*) as cnt, \"patientPhone\" FROM ai_logs WHERE \"patientPhone\" ~ '^[0-9]{14,15}$' GROUP BY \"patientPhone\""
  );
  console.log('AI logs com LID:', logs);
  
  // handoffs com patientPhone de 14-15 dígitos
  const { rows: handoffs } = await pool.query(
    "SELECT COUNT(*) as cnt, \"patientPhone\" FROM handoffs WHERE \"patientPhone\" ~ '^[0-9]{14,15}$' GROUP BY \"patientPhone\""
  );
  console.log('Handoffs com LID:', handoffs);
  
  // handoff_messages
  const { rows: hmsgs } = await pool.query(
    "SELECT COUNT(*) as cnt, \"patientPhone\" FROM handoff_messages WHERE \"patientPhone\" ~ '^[0-9]{14,15}$' GROUP BY \"patientPhone\""
  );
  console.log('Handoff messages com LID:', hmsgs);
  
  const doMigrate = process.argv[2] === '--migrate';
  if (!doMigrate) {
    console.log('\nPasse --migrate para executar a migração');
    await pool.end();
    return;
  }
  
  console.log('\n=== Executando migração ===');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Migrar patients
    const { rowCount: pCount } = await client.query(
      "UPDATE patients SET phone = phone || '@lid' WHERE phone ~ '^[0-9]{14,15}$'"
    );
    console.log(`patients atualizados: ${pCount}`);
    
    // Migrar ai_logs
    const { rowCount: lCount } = await client.query(
      "UPDATE ai_logs SET \"patientPhone\" = \"patientPhone\" || '@lid' WHERE \"patientPhone\" ~ '^[0-9]{14,15}$'"
    );
    console.log(`ai_logs atualizados: ${lCount}`);
    
    // Migrar handoffs
    const { rowCount: hCount } = await client.query(
      "UPDATE handoffs SET \"patientPhone\" = \"patientPhone\" || '@lid' WHERE \"patientPhone\" ~ '^[0-9]{14,15}$'"
    );
    console.log(`handoffs atualizados: ${hCount}`);
    
    // Migrar handoff_messages
    const { rowCount: hmCount } = await client.query(
      "UPDATE handoff_messages SET \"patientPhone\" = \"patientPhone\" || '@lid' WHERE \"patientPhone\" ~ '^[0-9]{14,15}$'"
    );
    console.log(`handoff_messages atualizados: ${hmCount}`);
    
    await client.query('COMMIT');
    console.log('\n✅ Migração concluída com sucesso!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro na migração (rollback):', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
