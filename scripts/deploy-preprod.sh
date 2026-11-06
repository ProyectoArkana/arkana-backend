#!/usr/bin/env bash
# Instala un artefacto en un ambiente de preproduccion y ejecuta una prueba de humo.
# Uso: scripts/deploy-preprod.sh <archivo.tar.gz> [directorio_destino]
# En un servidor real: BASE=/opt/arkana (con shared/.env). En CI: directorio temporal.
set -euo pipefail

ARCHIVE="$(realpath "${1:?Uso: $0 <archivo.tar.gz> [destino]}")"
BASE="${2:-${BASE:-/opt/arkana}}"
NAME="$(basename "$ARCHIVE" .tar.gz)"
RELEASE="$BASE/releases/$NAME"

mkdir -p "$BASE/releases" "$BASE/shared"
rm -rf "$RELEASE"
tar -xzf "$ARCHIVE" -C "$BASE/releases"

# Variables de entorno independientes del paquete
if [ -f "$BASE/shared/.env" ]; then
  ln -sf "$BASE/shared/.env" "$RELEASE/.env"
else
  echo "AVISO: no existe $BASE/shared/.env; se usan variables del entorno actual"
fi

# Activar la version (enlace simbolico atomico)
ln -sfn "$RELEASE" "$BASE/current"
echo "Version activa: $(readlink "$BASE/current")"

# Prueba de humo: levantar servicios y consultar /health
cd "$RELEASE"
PIDS=()
cleanup() { kill "${PIDS[@]}" 2>/dev/null || true; }
trap cleanup EXIT
PORT=13001 node services/auth-service/src/index.js & PIDS+=($!)
PORT=13000 AUTH_SERVICE_URL=http://127.0.0.1:13001 node services/api-gateway/src/index.js & PIDS+=($!)

for svc in 13000:api-gateway 13001:auth-service; do
  port="${svc%%:*}"; name="${svc##*:}"
  curl -fsS --retry 10 --retry-connrefused --retry-delay 1 "http://127.0.0.1:${port}/health" | grep -q '"status":"up"' \
    && echo "[OK] $name responde en /health" \
    || { echo "[FALLO] $name no responde"; exit 1; }
done
echo "Entrega a preproduccion verificada: $NAME"
