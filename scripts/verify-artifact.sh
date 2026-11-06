#!/usr/bin/env bash
# Valida un artefacto de liberacion. Uso: scripts/verify-artifact.sh <archivo.tar.gz>
# Escribe el resultado en $REPORT (si existe) y en $GITHUB_STEP_SUMMARY (si existe).
set -uo pipefail

ARCHIVE="${1:?Uso: $0 <archivo.tar.gz>}"
REPORT="${REPORT:-}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FAILS=0
ROWS=""

check() { # check "<descripcion>" <codigo> "<detalle>"
  local status="OK"
  [ "$2" -eq 0 ] || { status="FALLO"; FAILS=$((FAILS+1)); }
  ROWS+="| $1 | $status | $3 |"$'\n'
  echo "[$status] $1 - $3"
}

# 1. Integridad
if [ -f "${ARCHIVE}.sha256" ]; then
  ( cd "$(dirname "$ARCHIVE")" && sha256sum -c "$(basename "$ARCHIVE").sha256" >/dev/null 2>&1 )
  check "Checksum SHA-256" $? "$(cut -c1-16 "${ARCHIVE}.sha256")..."
else
  check "Checksum SHA-256" 1 "no existe ${ARCHIVE}.sha256"
fi

tar -xzf "$ARCHIVE" -C "$TMP"
ROOT="$TMP/$(ls "$TMP" | head -1)"

# 2. Archivos necesarios
MISSING=""
for f in package.json package-lock.json init-db.sql .env.example VERSION.txt \
         services/api-gateway/src/index.js services/auth-service/src/index.js \
         node_modules/express scripts/deploy-preprod.sh; do
  [ -e "$ROOT/$f" ] || MISSING+="$f "
done
[ -z "$MISSING" ]; check "Archivos necesarios presentes" $? "${MISSING:-todos presentes}"

# 3. Archivos prohibidos / sensibles
FORBID="$(find "$ROOT" -not -path '*/node_modules/*' \( -name '.env' -o -name '.env.*' -o -name '*.pem' -o -name '*.key' -o -name '.git' -o -name '.github' -o -name 'tests' -o -name 'docker-compose.yml' \) ! -name '.env.example' | sed "s|$ROOT/||" | tr '\n' ' ')"
[ -z "$FORBID" ]; check "Sin .env, llaves, .git, tests ni docker-compose" $? "${FORBID:-limpio}"

# 4. Escaneo de secretos en codigo propio (no node_modules)
SECRETS="$(grep -rIlE 'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}' "$ROOT" --exclude-dir=node_modules 2>/dev/null | sed "s|$ROOT/||" | tr '\n' ' ')"
[ -z "$SECRETS" ]; check "Sin llaves privadas ni tokens en el codigo" $? "${SECRETS:-ninguno encontrado}"

# 5. Sintaxis y dependencias de produccion
SYNTAX=0
while IFS= read -r js; do node --check "$js" 2>/dev/null || SYNTAX=1; done < <(find "$ROOT/services" -path '*/node_modules' -prune -o -name '*.js' -print)
check "Sintaxis JavaScript valida" $SYNTAX "node --check sobre services/"

( cd "$ROOT" && node -e "['express','jsonwebtoken','pg','dotenv'].forEach(m=>require.resolve(m,{paths:[process.cwd()+'/services/api-gateway',process.cwd()+'/services/auth-service']}))" ) 2>/dev/null
check "Dependencias de produccion resolubles" $? "express, jsonwebtoken, pg, dotenv"

OUT="### Validacion de $(basename "$ARCHIVE")"$'\n\n'"| Verificacion | Resultado | Detalle |"$'\n'"|---|---|---|"$'\n'"$ROWS"
[ -n "$REPORT" ] && printf '%s\n' "$OUT" > "$REPORT"
[ -n "${GITHUB_STEP_SUMMARY:-}" ] && printf '%s\n' "$OUT" >> "$GITHUB_STEP_SUMMARY"

if [ "$FAILS" -gt 0 ]; then echo "VALIDACION FALLIDA ($FAILS)"; exit 1; fi
echo "VALIDACION EXITOSA"
