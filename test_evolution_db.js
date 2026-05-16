// Conecta ao Neon DB da Evolution API e procura mapeamento LID -> telefone
const { Pool } = require('/evolution/node_modules/pg');

const LID = '167933355495634@lid';
const LID_DIGITS = '167933355495634';

// Requer EVOLUTION_DB_URL no ambiente — nunca commitar credenciais hardcoded!
const connectionString = process.env.EVOLUTION_DB_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('EVOLUTION_DB_URL ou DATABASE_URL nao definida');
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function main() {
  // 1. Listar todas as tabelas
  const { rows: tables } = await pool.query(`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `);
  console.log('Tabelas:', tables.map(r => r.tablename).join(', '));

  // 2. Buscar na tabela Contact qualquer coisa com o LID
  try {
    const { rows } = await pool.query(
      'SELECT * FROM "Contact" WHERE "remoteJid" LIKE $1 LIMIT 5',
      ['%' + LID_DIGITS + '%']
    );
    console.log('\nContact (LID):', JSON.stringify(rows, null, 2));
  } catch(e) { console.log('Contact erro:', e.message); }

  // 3. Buscar na tabela Auth (sessão Baileys)
  try {
    const { rows } = await pool.query('SELECT "id", LEFT("content"::text, 200) FROM "Auth" LIMIT 3');
    console.log('\nAuth (amostra):', JSON.stringify(rows, null, 2));
  } catch(e) { console.log('Auth erro:', e.message); }

  // 4. Buscar em SessionKV ou similar (Baileys auth state)
  try {
    const { rows } = await pool.query(
      'SELECT * FROM "AuthSession" WHERE id LIKE $1 LIMIT 5',
      ['%' + LID_DIGITS + '%']
    );
    console.log('\nAuthSession (LID):', JSON.stringify(rows, null, 2));
  } catch(e) { console.log('AuthSession erro:', e.message); }

  // 5. Buscar por contact-list ou addr-book nas tabelas
  const tableNames = tables.map(r => r.tablename);
  for (const t of tableNames) {
    if (t.toLowerCase().includes('auth') || t.toLowerCase().includes('session') || t.toLowerCase().includes('key')) {
      try {
        const { rows } = await pool.query('SELECT * FROM "' + t + '" LIMIT 2');
        console.log('\nTabela ' + t + ':', JSON.stringify(rows).slice(0, 300));
      } catch(e) {}
    }
  }

  await pool.end();
}

main().catch(e => console.error('Erro:', e.message));
