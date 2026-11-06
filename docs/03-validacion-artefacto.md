# Parte 4. Validación del artefacto

**Alumno:** [NOMBRE COMPLETO] · **Matrícula:** [MATRÍCULA] · **Rama:** `ci/actividad09-RNDaniela`
**Ejecución de GitHub Actions:** [URL DE LA EJECUCIÓN] · **Versión validada:** [p. ej. 1.0.0-rc.N] · **Fecha:** [FECHA]

## Procedimiento
1. Descargar: pestaña *Actions* → ejecución → *Artifacts* → `arkana-backend-release-<versión>` (o `gh run download <id>`).
2. Descomprimir y ejecutar localmente: `bash scripts/verify-artifact.sh arkana-backend-<versión>.tar.gz`
3. Revisar manualmente: `tar -tzf arkana-backend-<versión>.tar.gz | grep -E '\.env|\.pem|\.key|\.git'` → **no debe devolver nada** (solo `.env.example` es válido).
4. Instalar en el ambiente: `bash scripts/deploy-preprod.sh arkana-backend-<versión>.tar.gz <destino>` y comprobar `/health`.

## Registro de resultados (completar con la salida real)
| # | Verificación | Esperado | Resultado | Evidencia |
|---|---|---|---|---|
| 1 | Artefacto descargado de Actions | Archivo `.tar.gz` + `.sha256` | [ ] | [captura] |
| 2 | Checksum SHA-256 correcto | OK | [ ] | [captura] |
| 3 | Contiene archivos necesarios | `services/*/src`, `node_modules`, `init-db.sql`, `.env.example` | [ ] | [captura] |
| 4 | Sin `.env`, llaves ni tokens | Ninguno | [ ] | [captura] |
| 5 | Dependencias de producción resolubles | OK | [ ] | [captura] |
| 6 | Instalación en preproducción | `/health` → `{"status":"up"}` en gateway y auth | [ ] | [captura] |

## Observaciones
- Con `nodemon` declarado en `dependencies` de ambos servicios, se instala en producción aunque solo se usa en desarrollo. Recomendación: moverlo a `devDependencies`.
- `JWT_SECRET` y la contraseña de BD tienen valores por defecto en el código (`auth.js`, `authController.js`, `db.js`). En preproducción deben definirse siempre por variable de entorno; idealmente el código debe fallar si faltan.
