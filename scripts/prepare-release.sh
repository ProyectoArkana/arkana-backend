#!/usr/bin/env bash
# Genera el paquete liberable de arkana-backend.
# Uso: scripts/prepare-release.sh <version>      (ej. 1.1.0 o 1.1.0-rc.7)
set -euo pipefail

VERSION="${1:?Uso: $0 <version>}"
VERSION="${VERSION#v}"
NAME="arkana-backend-${VERSION}"
OUT_DIR="${OUT_DIR:-dist}"
STAGE="${OUT_DIR}/${NAME}"

rm -rf "$OUT_DIR"
mkdir -p "$STAGE/scripts"

# 1. Lista blanca: solo lo necesario para ejecutar en otro entorno
cp package.json package-lock.json init-db.sql .env.example "$STAGE/"
for dir in services/*/; do
  svc="$(basename "$dir")"
  mkdir -p "$STAGE/services/$svc"
  cp "$dir/package.json" "$STAGE/services/$svc/"
  cp -r "$dir/src" "$STAGE/services/$svc/src"
done
cp scripts/verify-artifact.sh scripts/deploy-preprod.sh "$STAGE/scripts/"

# 2. Defensa extra: nunca empaquetar .env reales ni llaves
find "$STAGE" \( -name '.env' -o -name '.env.*' \) ! -name '.env.example' -delete
find "$STAGE" \( -name '*.pem' -o -name '*.key' \) -delete

# 3. Dependencias de produccion
( cd "$STAGE" && npm ci --omit=dev )

# 4. Metadatos de la version
COMMIT="${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo desconocido)}"
cat > "$STAGE/VERSION.txt" <<INFO
nombre=arkana-backend
version=${VERSION}
commit=${COMMIT}
generado=$(date -u +%Y-%m-%dT%H:%M:%SZ)
ejecucion=${GITHUB_RUN_ID:-local}
INFO

# 5. Comprimir y calcular checksum
tar -czf "${OUT_DIR}/${NAME}.tar.gz" -C "$OUT_DIR" "$NAME"
( cd "$OUT_DIR" && sha256sum "${NAME}.tar.gz" > "${NAME}.tar.gz.sha256" )
rm -rf "$STAGE"

echo "Paquete generado: ${OUT_DIR}/${NAME}.tar.gz"
ls -lh "$OUT_DIR"
