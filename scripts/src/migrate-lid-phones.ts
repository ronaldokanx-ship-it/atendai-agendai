// Migração @lid: executar via drizzle/postgres do workspace
import { Pool } from "pg";
import * as fs from "fs";

// Carregar .env
const envPath = new URL("../../.env", import.meta.url).pathname.slice(1).replace(/^\/([A-Z]:)/, "$1");
const envContent = fs.readFileSync(envPath.startsWith("/") ? envPath : "/" + envPath, "utf8");
envContent.split("\n").forEach(line => {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
});

const DATABASE_URL = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString: DATABASE_URL });

async function main() {
  console.log("=== Preview da migração LID ===\n");

  const { rows: pts } = await pool.query(
    "SELECT id, phone, name, clinic_id FROM patients WHERE phone ~ '^[0-9]{14,15}$'"
  );
  console.log("Pacientes com LID:", pts);

  const { rows: logs } = await pool.query(
    `SELECT COUNT(*) as cnt, "patientPhone" FROM ai_logs WHERE "patientPhone" ~ '^[0-9]{14,15}$' GROUP BY "patientPhone"`
  );
  console.log("AI logs com LID:", logs);

  const { rows: handoffs } = await pool.query(
    `SELECT COUNT(*) as cnt, "patientPhone" FROM handoffs WHERE "patientPhone" ~ '^[0-9]{14,15}$' GROUP BY "patientPhone"`
  );
  console.log("Handoffs com LID:", handoffs);

  const { rows: hmsgs } = await pool.query(
    `SELECT COUNT(*) as cnt, "patientPhone" FROM handoff_messages WHERE "patientPhone" ~ '^[0-9]{14,15}$' GROUP BY "patientPhone"`
  );
  console.log("Handoff messages com LID:", hmsgs);

  const doMigrate = process.argv[2] === "--migrate";
  if (!doMigrate) {
    console.log("\nPasse --migrate para executar a migração");
    await pool.end();
    return;
  }

  console.log("\n=== Executando migração ===");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rowCount: pCount } = await client.query(
      "UPDATE patients SET phone = phone || '@lid' WHERE phone ~ '^[0-9]{14,15}$'"
    );
    console.log(`patients atualizados: ${pCount}`);

    const { rowCount: lCount } = await client.query(
      `UPDATE ai_logs SET "patientPhone" = "patientPhone" || '@lid' WHERE "patientPhone" ~ '^[0-9]{14,15}$'`
    );
    console.log(`ai_logs atualizados: ${lCount}`);

    const { rowCount: hCount } = await client.query(
      `UPDATE handoffs SET "patientPhone" = "patientPhone" || '@lid' WHERE "patientPhone" ~ '^[0-9]{14,15}$'`
    );
    console.log(`handoffs atualizados: ${hCount}`);

    const { rowCount: hmCount } = await client.query(
      `UPDATE handoff_messages SET "patientPhone" = "patientPhone" || '@lid' WHERE "patientPhone" ~ '^[0-9]{14,15}$'`
    );
    console.log(`handoff_messages atualizados: ${hmCount}`);

    await client.query("COMMIT");
    console.log("\n✅ Migração concluída com sucesso!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Erro na migração (rollback):", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
