#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  deploy/scripts/deploy-vm2.sh
#  Deploy/atualização da VM2 — Evolution API (Oracle Cloud x86)
#
#  Pré-requisitos na VM:
#    - Ubuntu 22.04
#    - Docker + Docker Compose v2 instalados
#    - git instalado
#    - .env.prod configurado em /opt/clinicai/
#
#  Uso (na VM2):
#    chmod +x deploy/scripts/deploy-vm2.sh
#    ./deploy/scripts/deploy-vm2.sh          # deploy normal
#    ./deploy/scripts/deploy-vm2.sh --ssl    # emite certificado SSL
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.vm2.yml"
ENV_FILE="$ROOT_DIR/.env.prod"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[vm2]${NC} $1"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; exit 1; }

command -v docker >/dev/null 2>&1 || error "Docker não encontrado."
command -v git    >/dev/null 2>&1 || error "git não encontrado."
[[ -f "$ENV_FILE" ]] || error "Arquivo .env.prod não encontrado."

set -a; source "$ENV_FILE"; set +a
: "${EVOLUTION_API_KEY:?EVOLUTION_API_KEY não definida}"
: "${EVOLUTION_DB_URL:?EVOLUTION_DB_URL não definida}"
: "${REDIS_PASSWORD:?REDIS_PASSWORD não definida}"
: "${EVO_DOMAIN:?EVO_DOMAIN não definida}"

if [[ "${1:-}" == "--ssl" ]]; then
    info "Emitindo certificado SSL para $EVO_DOMAIN..."
    docker run --rm -p 80:80 \
        -v certbot_certs:/etc/letsencrypt \
        -v certbot_www:/var/www/certbot \
        certbot/certbot certonly \
        --standalone \
        --email "$CERTBOT_EMAIL" \
        --agree-tos \
        --no-eff-email \
        -d "$EVO_DOMAIN"
    info "Certificado emitido! Execute sem --ssl para iniciar os serviços."
    exit 0
fi

info "Atualizando código..."
cd "$ROOT_DIR"
git pull origin main

info "Iniciando Evolution API + Redis..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull --ignore-pull-failures || true
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --remove-orphans

info "Aguardando Evolution API..."
RETRIES=15
for i in $(seq 1 $RETRIES); do
    if curl -sf "http://localhost:8080/" > /dev/null 2>&1; then
        info "Evolution API saudável! ✓"
        break
    fi
    [[ $i -eq $RETRIES ]] && error "Evolution não respondeu. Logs: docker compose -f $COMPOSE_FILE logs evolution"
    warn "Aguardando ($i/$RETRIES)..."
    sleep 5
done

if ! crontab -l 2>/dev/null | grep -q "certbot"; then
    (crontab -l 2>/dev/null; echo "0 3 * * * docker run --rm -v certbot_certs:/etc/letsencrypt -v certbot_www:/var/www/certbot certbot/certbot renew --webroot -w /var/www/certbot && docker compose -f $COMPOSE_FILE exec nginx nginx -s reload") | crontab -
fi

info "Deploy VM2 concluído!"
info "Evolution API em: https://$EVO_DOMAIN"
