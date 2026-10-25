#!/usr/bin/env bash
set -euo pipefail

echo "1/5 Version de Node"; node -v | grep -q '^v22' || { echo "Se requiere Node 22"; exit 1; }
echo "2/5 Dependencias";    npm ci
echo "3/5 Analisis estatico"; npm run lint
echo "4/5 Pruebas unitarias"; npm test

if [ "${1:-}" = "--integration" ]; then
  echo "5/5 Integracion (requiere Docker)"
  docker compose up -d postgres
  until docker compose exec -T postgres pg_isready -U arkana_admin; do sleep 2; done
  PGPASSWORD="$DB_PASSWORD" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f init-db.sql
  npm run test:integration
fi
echo "Verificacion completada"
