const { Pool } = require('/app/lib/db/node_modules/pg');
const p = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_5jZaUwytCbg4@ep-nameless-bread-acjpjdap.sa-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function main() {
  const clinics = await p.query('SELECT id, name, "evolutionInstanceName", "aiEnabled" FROM clinics ORDER BY id');
  console.log('=== CLINICS ===');
  console.log(JSON.stringify(clinics.rows, null, 2));

  const services = await p.query('SELECT id, "clinicId", name, duration, price FROM services ORDER BY id LIMIT 10');
  console.log('=== SERVICES ===');
  console.log(JSON.stringify(services.rows, null, 2));

  const profs = await p.query('SELECT id, "clinicId", name, specialty FROM professionals ORDER BY id LIMIT 5');
  console.log('=== PROFESSIONALS ===');
  console.log(JSON.stringify(profs.rows, null, 2));

  await p.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
