#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  deploy/scripts/backup.sh
#  Backup diário do PostgreSQL para arquivo comprimido.
#  Configure no cron da VM: 0 2 * * * /opt/clinicai/deploy/scripts/backup.sh
#
#  Retenção: 7 dias locais (configure rclone para cloud)
# ─────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.prod"

[[ -f "$ENV_FILE" ]] && source "$ENV_FILE"

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/clinicai_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[backup] Iniciando backup em $BACKUP_FILE..."

docker exec clinicai-postgres pg_dumpall \
  -U "${POSTGRES_USER:-clinicai}" \
  | gzip -9 > "$BACKUP_FILE"

echo "[backup] Backup concluído: $(du -sh "$BACKUP_FILE" | cut -f1)"

# Remove backups mais antigos que RETENTION_DAYS
find "$BACKUP_DIR" -name "clinicai_*.sql.gz" -mtime +$RETENTION_DAYS -delete
echo "[backup] Backups antigos (>${RETENTION_DAYS}d) removidos."

# (Opcional) Envia para Object Storage Oracle ou rclone
# rclone copy "$BACKUP_FILE" oracle-storage:clinicai-backups/ --quiet
