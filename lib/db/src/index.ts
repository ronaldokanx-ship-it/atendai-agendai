import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Neon (cloud) requires SSL; local Postgres does not.
// Auto-detect: if DATABASE_URL contains "neon.tech" or SSL_MODE=require, enforce SSL.
const sslRequired =
  process.env.DATABASE_URL.includes("neon.tech") ||
  process.env.DATABASE_URL.includes("sslmode=require") ||
  process.env.DATABASE_SSL === "require";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslRequired ? { rejectUnauthorized: false } : undefined,
  max: 10,
  // Neon serverless encerra conexões ociosas após ~5 min.
  // Usar idleTimeoutMillis menor garante que o pool descarta antes de receber erro.
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 10_000,
  // Necessário para reconexão automática após queda de rede ou timeout do Neon
  allowExitOnIdle: false,
});

// Evita crash do processo em erros de conexão ociosa do pool
pool.on("error", (err) => {
  console.error("[DB Pool] Erro em cliente ocioso:", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
