#!/usr/bin/env sh
# Recria o banco local do zero: DROP/CREATE, migrations, senhas de dev dos roles e seed.
# ATENÇÃO: apaga o banco inteiro. Uso: npm run db:reset -w api
set -eu
cd "$(dirname "$0")/.."

# Variáveis já exportadas têm prioridade sobre o .env.
if [ -z "${MIGRATION_DATABASE_URL:-}" ] && [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${MIGRATION_DATABASE_URL:?defina MIGRATION_DATABASE_URL (veja .env.example)}"

DB_NAME="${MIGRATION_DATABASE_URL##*/}"
DB_NAME="${DB_NAME%%\?*}"
MAINTENANCE_URL="${MIGRATION_DATABASE_URL%/*}/postgres"

echo ">> Recriando o banco $DB_NAME"
psql "$MAINTENANCE_URL" -v ON_ERROR_STOP=1 -q \
  -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE)" \
  -c "CREATE DATABASE \"$DB_NAME\""

echo ">> Aplicando migrations"
npx node-pg-migrate up -m migrations -j sql -d MIGRATION_DATABASE_URL

echo ">> Definindo senhas de desenvolvimento dos roles (só banco local)"
psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -q \
  -c "ALTER ROLE cinemotion_customer PASSWORD 'cinemotion_customer'" \
  -c "ALTER ROLE cinemotion_admin PASSWORD 'cinemotion_admin'"

echo ">> Aplicando seed"
psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -q -f seeds/seed.sql

echo ">> Pronto"
