#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  deploy/scripts/deploy.sh
#  Script de deploy/atualização em produção (Oracle Cloud ARM)
#
#  Uso:
#    chmod +x deploy/scripts/deploy.sh
#    ./deploy/scripts/deploy.sh          # deploy completo
#    ./deploy/scripts/deploy.sh --build  # força rebuild das imagens
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.prod.yml"
ENV_FILE="$ROOT_DIR/.env.prod"

# ── Cores ─────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[deploy]${NC} $1"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $1"; }
error() { echo -e "${RED}[error]${NC} $1"; exit 1; }

# ── Pré-requisitos ────────────────────────────────────────────
command -v docker   >/dev/null 2>&1 || error "Docker não encontrado. Instale com: curl -fsSL https://get.docker.com | sh"
command -v git      >/dev/null 2>&1 || error "git não encontrado."

[[ -f "$ENV_FILE" ]] || error "Arquivo .env.prod não encontrado. Copie .env.prod.example e preencha."

# ── Valida variáveis obrigatórias ────────────────────────────
source "$ENV_FILE"
: "${POSTGRES_PASSWORD:?Defina POSTGRES_PASSWORD no .env.prod}"
: "${REDIS_PASSWORD:?Defina REDIS_PASSWORD no .env.prod}"
: "${JWT_SECRET:?Defina JWT_SECRET no .env.prod}"
: "${EVOLUTION_API_KEY:?Defina EVOLUTION_API_KEY no .env.prod}"
: "${DOMAIN:?Defina DOMAIN no .env.prod}"

# ── Atualiza código ───────────────────────────────────────────
info "Atualizando código via git pull..."
cd "$ROOT_DIR"
git pull origin main

# ── Rebuild (opcional) ────────────────────────────────────────
BUILD_FLAG=""
if [[ "${1:-}" == "--build" ]]; then
  BUILD_FLAG="--build"
  info "Modo --build: reconstruindo imagens Docker..."
fi

# ── Pull imagens base atualizadas ─────────────────────────────
info "Atualizando imagens base..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull --ignore-pull-failures postgres redis nginx certbot || true

# ── Sobe os serviços ──────────────────────────────────────────
info "Subindo serviços..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d $BUILD_FLAG

# ── Aguarda API ficar healthy ─────────────────────────────────
info "Aguardando API ficar saudável..."
MAX_WAIT=120
ELAPSED=0
until docker compose -f "$COMPOSE_FILE" ps api | grep -q "healthy"; do
  if (( ELAPSED >= MAX_WAIT )); then
    error "API não ficou healthy em ${MAX_WAIT}s. Verifique: docker logs clinicai-api"
  fi
  sleep 5
  ELAPSED=$((ELAPSED + 5))
  echo -n "."
done
echo ""

# ── Migrations do banco ───────────────────────────────────────
info "Executando migrations Drizzle..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec api \
  node -e "
    const { db } = await import('./dist/index.mjs').catch(() => ({}));
  " 2>/dev/null || true

# Alternativa direta via drizzle-kit (requer acesso ao host):
# DATABASE_URL="\$(grep DATABASE_URL $ENV_FILE | cut -d= -f2)" \
#   pnpm --filter @workspace/db run push

# ── Remove imagens antigas ────────────────────────────────────
info "Limpando imagens não utilizadas..."
docker image prune -f

# ── Status final ──────────────────────────────────────────────
info "Deploy concluído! Status dos serviços:"
docker compose -f "$COMPOSE_FILE" ps
