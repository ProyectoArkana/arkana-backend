#!/usr/bin/env bash
# Prepara un servidor Ubuntu/Debian para preproduccion. Ejecutar con sudo.
set -euo pipefail

apt-get update
apt-get install -y curl nginx postgresql ca-certificates
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

id arkana >/dev/null 2>&1 || useradd --system --home /opt/arkana --shell /usr/sbin/nologin arkana
mkdir -p /opt/arkana/releases /opt/arkana/shared
install -m 600 -o arkana -g arkana /dev/null /opt/arkana/shared/.env
chown -R arkana:arkana /opt/arkana

cp deploy/nginx-arkana-preprod.conf /etc/nginx/sites-available/arkana
ln -sf /etc/nginx/sites-available/arkana /etc/nginx/sites-enabled/arkana
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

cp deploy/arkana@.service /etc/systemd/system/arkana@.service
systemctl daemon-reload
echo "Listo. Falta: crear BD/usuario en PostgreSQL y completar /opt/arkana/shared/.env"
