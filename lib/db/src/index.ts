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
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export const db = drizzle(pool, { schema });

export * from "./schema";
