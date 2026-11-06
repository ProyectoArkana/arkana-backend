# Parte 3. Ambiente de preproducción

**Alumno:** [NOMBRE COMPLETO] · **Matrícula:** [MATRÍCULA] · **Rama:** `ci/actividad09-RNDaniela`

No se usa un servidor de producción real. Opciones válidas: máquina virtual local, servidor de pruebas autorizado, o el entorno `preproduccion` de GitHub Actions (prueba de humo en el runner). Ambiente utilizado: **[COMPLETAR: VM Ubuntu 24.04 / runner de GitHub / otro]**.

## Equivalencias con lo solicitado (Laravel → arkana-backend)
| Requisito de la actividad | Equivalente en este proyecto |
|---|---|
| PHP compatible | **Node.js 22** (mismo que el CI) |
| Composer | **npm** (`npm ci --omit=dev` ya aplicado dentro del artefacto) |
| Extensiones PHP | No aplica; el driver `pg` es JavaScript puro |
| Apache / Nginx | **Nginx** como proxy inverso hacia el gateway (`deploy/nginx-arkana-preprod.conf`) |
| BD de pruebas | **PostgreSQL 15** exclusiva (`arkana_preprod`), cargada con `init-db.sql` |
| Variables independientes | `/opt/arkana/shared/.env` (no viaja en el artefacto; plantilla `.env.example`) |
| Permisos `storage/` y `bootstrap/cache/` | Usuario sin privilegios `arkana`; `.env` con `chmod 600`; `releases/` solo escritura del usuario de despliegue |

## Parámetros de configuración
| Parámetro | Valor |
|---|---|
| Sistema operativo | [COMPLETAR] |
| Node.js | 22.x |
| PostgreSQL | 15 · base `arkana_preprod` · usuario `arkana_preprod` |
| Puertos internos | gateway 3000 · auth-service 3001 |
| Puerto público (Nginx) | 80 |
| Directorios | `/opt/arkana/releases/<versión>` · `/opt/arkana/current` (enlace) · `/opt/arkana/shared/.env` |
| Servicios | `arkana@api-gateway`, `arkana@auth-service` (systemd, `deploy/arkana@.service`) |
| Variables | `NODE_ENV`, `PORT`, `AUTH_SERVICE_URL`, `JWT_SECRET`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` |

## Preparar el servidor (una sola vez)
```bash
sudo bash scripts/setup-preprod-server.sh      # instala Node 22, Nginx, PostgreSQL; crea usuario y carpetas
sudo -u postgres psql -c "CREATE USER arkana_preprod WITH PASSWORD '<contraseña>';"
sudo -u postgres psql -c "CREATE DATABASE arkana_preprod OWNER arkana_preprod;"
sudo -u postgres psql -d arkana_preprod -f /opt/arkana/current/init-db.sql
sudo nano /opt/arkana/shared/.env && sudo chmod 600 /opt/arkana/shared/.env   # basado en .env.example
```

## Entregar una versión
```bash
gh run download <ID_EJECUCION> -n arkana-backend-release-<versión>
BASE=/opt/arkana bash scripts/deploy-preprod.sh arkana-backend-<versión>.tar.gz
sudo systemctl restart arkana@api-gateway arkana@auth-service
curl http://<host>/health
```
**Rollback:** `ln -sfn /opt/arkana/releases/<versión-anterior> /opt/arkana/current` y reiniciar los servicios.
