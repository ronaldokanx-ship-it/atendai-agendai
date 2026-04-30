#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  deploy/scripts/deploy-vm1.sh
#  Deploy/atualização da VM1 — Backend API (Oracle Cloud x86)
#
#  Pré-requisitos na VM:
#    - Ubuntu 22.04
#    - Docker + Docker Compose v2 instalados
#    - git instalado
#    - .env.prod configurado em /opt/clinicai/
#
#  Uso (na VM1):
#    chmod +x deploy/scripts/deploy-vm1.sh
#    ./deploy/scripts/deploy-vm1.sh           # deploy normal
#    ./deploy/scripts/deploy-vm1.sh --build   # força rebuild
#    ./deploy/scripts/deploy-vm1.sh --ssl     # emite certificado SSL
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.vm1.yml"
ENV_FILE="$ROOT_DIR/.env.prod"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[vm1]${NC} $1"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; exit 1; }

# ── Pré-requisitos ────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || error "Docker não encontrado. Instale com: curl -fsSL https://get.docker.com | sh"
command -v git    >/dev/null 2>&1 || error "git não encontrado."

[[ -f "$ENV_FILE" ]] || error "Arquivo .env.prod não encontrado. Copie .env.prod.example."

# ── Carrega env e valida variáveis obrigatórias ───────────────
set -a; source "$ENV_FILE"; set +a
: "${DATABASE_URL:?DATABASE_URL não definida no .env.prod}"
: "${JWT_SECRET:?JWT_SECRET não definida no .env.prod}"
: "${EVOLUTION_API_URL:?EVOLUTION_API_URL não definida no .env.prod}"
: "${API_DOMAIN:?API_DOMAIN não definida no .env.prod}"

# ── Emite certificado SSL (primeira vez) ──────────────────────
if [[ "${1:-}" == "--ssl" ]]; then
    info "Emitindo certificado SSL para $API_DOMAIN via Let's Encrypt..."

    # Certbot standalone (para inicial) — para na porta 80 brevemente
    docker run --rm -p 80:80 \
        -v certbot_certs:/etc/letsencrypt \
        -v certbot_www:/var/www/certbot \
        certbot/certbot certonly \
        --standalone \
        --email "$CERTBOT_EMAIL" \
        --agree-tos \
        --no-eff-email \
        -d "$API_DOMAIN"

    info "Certificado emitido com sucesso!"
    info "Execute novamente sem --ssl para iniciar os serviços."
    exit 0
fi

# ── Atualiza código ───────────────────────────────────────────
info "Atualizando código via git pull..."
cd "$ROOT_DIR"
git pull origin main

# ── Rebuild ───────────────────────────────────────────────────
BUILD_FLAG=""
[[ "${1:-}" == "--build" ]] && { BUILD_FLAG="--build"; info "Modo --build: reconstruindo imagem Docker..."; }

# ── Deploy ────────────────────────────────────────────────────
info "Iniciando/atualizando serviços VM1 (API + Nginx)..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull --ignore-pull-failures || true
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --remove-orphans $BUILD_FLAG

# ── Verifica saúde ────────────────────────────────────────────
info "Aguardando API ficar saudável..."
RETRIES=12
for i in $(seq 1 $RETRIES); do
    if curl -sf "http://localhost:3000/api/health" > /dev/null 2>&1; then
        info "API saudável! ✓"
        break
    fi
    [[ $i -eq $RETRIES ]] && error "API não respondeu após $((RETRIES * 5))s. Logs: docker compose -f $COMPOSE_FILE logs api"
    warn "Aguardando ($i/$RETRIES)..."
    sleep 5
done

# ── Renovação automática do certificado ──────────────────────
if ! crontab -l 2>/dev/null | grep -q "certbot"; then
    info "Configurando renovação automática do certificado SSL..."
    (crontab -l 2>/dev/null; echo "0 3 * * * docker run --rm -v certbot_certs:/etc/letsencrypt -v certbot_www:/var/www/certbot certbot/certbot renew --webroot -w /var/www/certbot && docker compose -f $COMPOSE_FILE exec nginx nginx -s reload") | crontab -
    info "Cron configurado para renovar SSL às 3h diariamente."
fi

info "Deploy VM1 concluído com sucesso!"
info "API disponível em: https://$API_DOMAIN/api/health"
