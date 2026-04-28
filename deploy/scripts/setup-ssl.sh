#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  deploy/scripts/setup-ssl.sh
#  Obtém o certificado SSL via Let's Encrypt (primeira vez)
#
#  Pré-requisitos:
#    - Domínio já apontando para o IP da VM
#    - Nginx já rodando com a config HTTP (porta 80)
#    - DOMAIN definido no .env.prod
#
#  Uso:
#    ./deploy/scripts/setup-ssl.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.prod"

[[ -f "$ENV_FILE" ]] || { echo "Erro: .env.prod não encontrado."; exit 1; }
source "$ENV_FILE"

: "${DOMAIN:?Defina DOMAIN no .env.prod}"
: "${CERTBOT_EMAIL:?Defina CERTBOT_EMAIL no .env.prod}"

echo "[ssl] Obtendo certificado para $DOMAIN..."

# Nginx deve estar rodando para responder ao desafio ACME HTTP-01
docker compose -f "$ROOT_DIR/docker-compose.prod.yml" --env-file "$ENV_FILE" up -d nginx

sleep 3

# Emite o certificado
docker run --rm \
  -v "$(docker volume inspect clinicai_certbot_www --format '{{ .Mountpoint }}'):/var/www/certbot" \
  -v "$(docker volume inspect clinicai_certbot_certs --format '{{ .Mountpoint }}'):/etc/letsencrypt" \
  certbot/certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$CERTBOT_EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN" \
    -d "www.$DOMAIN"

echo "[ssl] Certificado obtido. Reiniciando Nginx..."
docker compose -f "$ROOT_DIR/docker-compose.prod.yml" --env-file "$ENV_FILE" restart nginx

echo "[ssl] SSL configurado com sucesso para $DOMAIN!"
