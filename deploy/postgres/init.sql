-- ─────────────────────────────────────────────────────────────
--  deploy/postgres/init.sql
--  Executado uma única vez na primeira subida do PostgreSQL.
--  Cria o banco da Evolution API (separado do clinic_sas).
-- ─────────────────────────────────────────────────────────────

-- Banco principal da aplicação (criado automaticamente via POSTGRES_DB na env)
-- Este script apenas garante que o banco da Evolution API também exista.

SELECT 'CREATE DATABASE evolution_api'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'evolution_api'
)\gexec
