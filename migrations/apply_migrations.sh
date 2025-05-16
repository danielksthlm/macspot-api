#!/bin/bash
# Körs med: ./apply_migrations.sh lokal|moln

LOCAL_ENV_FILE="../.env"
if [ -f "$LOCAL_ENV_FILE" ]; then
  set -a
  source "$LOCAL_ENV_FILE"
  set +a
fi

REQUIRED_VARS=("LOCAL_DB_NAME" "LOCAL_DB_USER" "LOCAL_DB_PASSWORD" "LOCAL_DB_PORT" "REMOTE_DB_NAME" "REMOTE_DB_USER" "REMOTE_DB_PASSWORD" "REMOTE_DB_HOST" "REMOTE_DB_PORT")
for VAR in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!VAR}" ]; then
    echo "❌ Miljövariabeln $VAR är inte satt. Kontrollera din .env-fil."
    exit 1
  fi
done

set -e

if [ "$1" == "lokal" ]; then
  export PGPASSWORD="$LOCAL_DB_PASSWORD"
  PSQL_CMD="psql -p $LOCAL_DB_PORT -U $LOCAL_DB_USER -d $LOCAL_DB_NAME"
elif [ "$1" == "moln" ]; then
  export PGPASSWORD="$REMOTE_DB_PASSWORD"
  PSQL_CMD="psql -h $REMOTE_DB_HOST -p $REMOTE_DB_PORT -U $REMOTE_DB_USER -d $REMOTE_DB_NAME --set=sslmode=require"
else
  echo "Använd: ./apply_migrations.sh lokal|moln"
  exit 1
fi

if [ "$1" == "lokal" ]; then
  FILES=$(ls ./*.sql | grep -vE 'slot_cache|available_slots_cache|travel_time_cache')
else
  FILES=$(ls ./*.sql)
fi

LOG_DIR="./logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/migration_$(date +%F_%H%M).log"
exec > >(tee -a "$LOG_FILE") 2>&1
echo "📄 Loggar till $LOG_FILE"

echo "▶ Kör migreringar med: $PSQL_CMD"

for file in $FILES; do
  echo "🔧 Migrerar: $file"
  echo "🔑 Ange lösenord manuellt om anslutning misslyckas..."
  $PSQL_CMD -f "$file" || {
    echo "⚠️ Misslyckades med PGPASSWORD, försöker interaktiv inloggning..."
    PSQL_CMD_INTERAKTIV=${PSQL_CMD/-U $REMOTE_DB_USER/-U $REMOTE_DB_USER -W}
    $PSQL_CMD_INTERAKTIV -f "$file"
  }
done

echo "✅ Alla migreringar körda."