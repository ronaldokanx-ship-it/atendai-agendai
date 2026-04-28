#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  deploy/scripts/migrate.sh
#  Executa migrations Drizzle ORM via drizzle-kit push
#  Deve ser rodado com a VM conectada ao banco de produção.
#
#  Uso (local, com acesso ao banco via túnel SSH):
#    ssh -L 5432:localhost:5432 ubuntu@SEU_IP "echo ok"
#    DATABASE_URL="postgresql://clinicai:SENHA@localhost:5432/clinic_sas" \
#      ./deploy/scripts/migrate.sh
#
#  Ou direto na VM:
#    ./deploy/scripts/migrate.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.prod"

# Carrega env se existir e DATABASE_URL não estiver setada
if [[ -z "${DATABASE_URL:-}" ]] && [[ -f "$ENV_FILE" ]]; then
  export $(grep -v '^#' "$ENV_FILE" | grep DATABASE_URL | xargs)
fi

: "${DATABASE_URL:?DATABASE_URL não definida. Defina no .env.prod ou exporte antes de rodar.}"

echo "[migrate] Conectando em: ${DATABASE_URL//:*@/:***@}"
echo "[migrate] Executando drizzle-kit push..."

cd "$ROOT_DIR"

# Usa pnpm do monorepo para executar o push
DATABASE_URL="$DATABASE_URL" pnpm --filter @workspace/db run push

echo "[migrate] Migrations aplicadas com sucesso!"
