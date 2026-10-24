# Arkana TCG — Backend

Backend del juego de cartas coleccionables **Arkana TCG**: cartas físicas con chip **NFC** que se escanean desde una app móvil para pelear batallas **1 vs 1** en línea.

Arquitectura de **microservicios en un monorepo** (Node.js + PostgreSQL). Este repositorio contiene todo el servidor; la app móvil vive en [`ArkanaMobile`](https://github.com/ProyectoArkana/ArkanaMobile).

> Alcance actual: **prototipo (MVP)**.

---

## Tabla de contenido

1. [Cómo funciona el juego](#cómo-funciona-el-juego)
2. [Arquitectura](#arquitectura)
3. [Requisitos](#requisitos)
4. [Instalación paso a paso](#instalación-paso-a-paso)
5. [Variables de entorno](#variables-de-entorno)
6. [Base de datos y cartas](#base-de-datos-y-cartas)
7. [Ejecución](#ejecución)
8. [Red, puertos y túneles](#red-puertos-y-túneles)
9. [Pruebas](#pruebas)
10. [API REST](#api-rest)
11. [Protocolo de batalla (WebSockets)](#protocolo-de-batalla-websockets)
12. [Reglas del juego implementadas](#reglas-del-juego-implementadas)
13. [Modelo de datos](#modelo-de-datos)
14. [Estructura del repositorio](#estructura-del-repositorio)
15. [Solución de problemas](#solución-de-problemas)
16. [Flujo de trabajo con Git](#flujo-de-trabajo-con-git)

---

## Cómo funciona el juego

1. El jugador inicia sesión en la app y entra al **matchmaking**, que lo conecta con otro jugador en una sala virtual.
2. En la fase **Pick**, cada jugador escanea físicamente las **5 cartas** de su equipo. El equipo es efímero: **no se guarda en la base de datos**, solo existe en la memoria del servidor mientras dura la partida.
3. El combate es por turnos. En cada turno se elige una acción: **atacar**, hacer **switch** con una carta de la banca o activar un **escudo** (2 por jugador y partida).
4. Gana quien reduce a 0 el HP de las 5 cartas del rival.
5. Las cartas **no tienen dueño**: se pueden prestar. El `nfc_id` del chip solo sirve para validar que la carta no es falsa y apuntar al catálogo.
6. Cada carta escaneada se desbloquea en la **Galería** del usuario (informativa y persistente, accesible desde cualquier dispositivo).

---

## Arquitectura

Todo el tráfico de la app (REST **y** WebSockets) entra por el **API Gateway, puerto 3000**.

| Servicio | Puerto | Responsabilidad |
|---|---|---|
| `api-gateway` | 3000 | Único punto de entrada. Verifica el JWT, inyecta la identidad del usuario y hace proxy. Rate limiting. |
| `auth-service` | 3001 | Registro y login. JWT **stateless** (sin tablas de sesión ni refresh tokens). |
| `user-service` | 3002 | Perfil, victorias/derrotas e historial de partidas. |
| `card-service` | 3003 | Catálogo, validación de chips NFC y Galería personal. |
| `matchmaking-service` | 3004 | Cola de emparejamiento en memoria (Socket.IO). Al emparejar pide una sala a `match-service`. |
| `match-service` | 3005 | Pick y batalla 1 vs 1 **autoritativa** (en memoria, Socket.IO). Guarda solo el resultado final. |
| `packages/shared` | — | Código común: pool de PostgreSQL, JWT, lectura del `.env`, normalización de UID NFC. |

```
App ──HTTP  /api/auth | users | cards ──▶ Gateway ──▶ servicios REST
App ──WS    /ws/queue  ────────────────▶ Gateway ──▶ matchmaking-service ──POST /internal/matches──▶ match-service
App ──WS    /ws/battle ────────────────▶ Gateway ──▶ match-service
```

Decisiones de diseño:

- **Servidor autoritativo**: el cliente solo envía intenciones (`attack`, `shield`, `switch`); el servidor calcula todo y manda a cada jugador su vista del estado. Nunca se envía el `nfc_id` de las cartas al cliente.
- **Identidad solo desde el JWT**: el gateway descarta cualquier `x-user-id` que mande el cliente y pone el suyo; los sockets validan el token en el handshake.
- **Cola y partidas en memoria**: `matchmaking-service` y `match-service` deben ejecutarse en **una sola instancia** (suficiente para el MVP). Si el servidor se reinicia, las partidas en curso se pierden.
- **PostgreSQL** es la única base de datos.

---

## Requisitos

| Herramienta | Versión | Para qué |
|---|---|---|
| Node.js | **22 o superior** | Ejecutar los servicios (usa `fetch` nativo y `node:test`). |
| npm | 10 o superior | Instalar dependencias (workspaces). |
| Docker + Docker Compose v2 | reciente | Levantar PostgreSQL. |
| Git | cualquiera | Clonar el repositorio. |

Comprueba tus versiones:

```bash
node -v && npm -v && docker --version && docker compose version
```

---

## Instalación paso a paso

```bash
# 1. Clonar
git clone https://github.com/ProyectoArkana/arkana-backend.git
cd arkana-backend

# 2. Crear tu archivo de entorno
cp .env.example .env
#    Edita .env y cambia JWT_SECRET e INTERNAL_API_KEY por valores propios.

# 3. Levantar PostgreSQL (crea las tablas desde init-db.sql)
docker compose up -d

# 4. Instalar dependencias de todos los servicios
npm install

# 5. Cargar las cartas reales y sus chips NFC
docker exec -i arkana_db psql -U arkana_admin -d arkana_db < seed-cartas.sql

# 6. Arrancar los 6 servicios
npm run dev
```

Comprueba que todo está vivo: abre <http://localhost:3000/health>; debe responder `{"service":"api-gateway","status":"up"}`.

---

## Variables de entorno

Todos los servicios leen **un único `.env` en la raíz** del monorepo. Parte de `.env.example`.

| Variable | Por defecto | Descripción |
|---|---|---|
| `JWT_SECRET` | *(valor de desarrollo)* | Secreto para firmar los tokens. **Obligatorio en producción.** |
| `INTERNAL_API_KEY` | *(valor de desarrollo)* | Clave con la que `matchmaking-service` pide salas a `match-service`. **Obligatoria en producción.** |
| `DB_HOST` | `localhost` | Host de PostgreSQL. |
| `DB_PORT` | `5433` | Puerto de PostgreSQL en tu máquina (ver nota abajo). |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | `arkana_admin` / `secretpassword` / `arkana_db` | Credenciales (coinciden con `docker-compose.yml`). |
| `DATABASE_URL` | — | Alternativa a las cuatro anteriores: `postgres://usuario:clave@host:5432/base`. |
| `GATEWAY_PORT` | `3000` | Puerto del API Gateway. |
| `AUTH_SERVICE_URL`, `USER_SERVICE_URL`, `CARD_SERVICE_URL`, `MATCHMAKING_SERVICE_URL`, `MATCH_SERVICE_URL` | `http://127.0.0.1:300X` | A dónde apunta el gateway para cada servicio. |
| `DISCONNECT_GRACE_SECONDS` | `30` | Segundos que un jugador puede estar desconectado antes de perder la partida. |

Cada servicio usa su propio puerto (`AUTH_PORT=3001`, `USER_PORT=3002`, `CARD_PORT=3003`, `MATCHMAKING_PORT=3004`, `MATCH_PORT=3005`); los valores por defecto ya son esos.

> **¿Por qué el puerto 5433?** PostgreSQL usa el 5432 por defecto, y muchas máquinas ya tienen uno instalado, lo que impide que el contenedor arranque (`address already in use`). Por eso el contenedor se publica en el **5433** (`5433:5432` en `docker-compose.yml`). Si tu 5432 está libre y prefieres usarlo, cambia ambos valores (`docker-compose.yml` y `DB_PORT`).

---

## Base de datos y cartas

La base corre en Docker (contenedor `arkana_db`). El esquema y las 10 cartas de ejemplo se crean desde `init-db.sql` **solo la primera vez** que se crea el volumen.

```bash
docker compose up -d      # levantar
docker compose down       # detener (conserva los datos)
docker compose down -v    # detener y BORRAR los datos (para recrear el esquema)
```

Conectarte con `psql`:

```bash
docker exec -it arkana_db psql -U arkana_admin -d arkana_db
```

Desde un cliente gráfico (DBeaver, TablePlus, pgAdmin): `localhost`, puerto `5433`, base `arkana_db`, usuario `arkana_admin`, contraseña `secretpassword`.

### Cartas reales (`seed-cartas.sql`)

Carga las 6 cartas físicas del proyecto con sus chips. Se puede ejecutar varias veces: actualiza en lugar de duplicar.

```bash
docker exec -i arkana_db psql -U arkana_admin -d arkana_db < seed-cartas.sql
```

| Chip (id impreso) | Carta | Elemento |
|---|---|---|
| `9A8FD110` | Pájaro de Fuego | FUEGO |
| `9A940C11` | Rabito | TIERRA |
| `6A66BB10` | Oso PoderOSO | AIRE |
| `A38034E2` | Ballena | AGUA |
| `4A7E1D11` | Zorrito | PLANTA |
| `C3DE7996` | Jeff | AGUA |

Si solo quieres tus cartas, borra las 10 de ejemplo (no afecta a las reales):

```bash
docker exec -it arkana_db psql -U arkana_admin -d arkana_db -c "DELETE FROM cards WHERE name IN ('Lobo de Fuego','Zorro Volcánico','Tiburón Feroz','Delfín Oceánico','Águila del Viento','Halcón de Tormenta','Oso Continental','Rinoceronte de Roca','Jaguar Selvático','Serpiente Esmeralda');"
```

### Registrar una carta física nueva

Vincula el UID de un chip con una carta del catálogo:

```bash
npm run tag:register -- list                              # catálogo con sus ids
npm run tag:register -- 04A1B2C3D4E5F6 3                  # chip -> carta con id 3
npm run tag:register -- 04A1B2C3D4E5F6 "Oso PoderOSO"     # también por nombre
```

El UID se normaliza a **HEX en mayúsculas sin separadores** (`04:a1:b2` → `04A1B2`). Para saber qué UID lee tu teléfono, escanea la carta en la app: si no está registrada, el error de `POST /api/cards/scan` incluye el UID recibido.

---

## Ejecución

| Comando | Qué hace |
|---|---|
| `npm run dev` | Arranca los 6 servicios con recarga automática (nodemon). |
| `npm start` | Arranca los 6 servicios sin recarga (producción). |
| `npm run dev:gateway` · `dev:auth` · `dev:users` · `dev:cards` · `dev:queue` · `dev:match` | Arranca un solo servicio. |
| `npm run tag:register -- …` | Registra chips NFC (ver arriba). |
| `npm test` | Pruebas del motor de combate. |

Comprobar cada servicio:

```bash
for p in 3000 3001 3002 3003 3004 3005; do curl -s localhost:$p/health; echo; done
```

Prueba rápida sin la app:

```bash
# Crear cuenta (devuelve un token)
curl -s -X POST localhost:3000/api/auth/register -H 'Content-Type: application/json' \
  -d '{"username":"prueba","email":"prueba@test.com","password":"123456"}'

# Escanear una carta con ese token
curl -s -X POST localhost:3000/api/cards/scan \
  -H "Authorization: Bearer <TOKEN>" -H 'Content-Type: application/json' \
  -d '{"nfc_id":"9A8FD110"}'
```

---

## Red, puertos y túneles

El backend **no necesita túneles** para funcionar. Lo único que importa es que la app llegue al **puerto 3000** (API Gateway); los puertos 3001–3005 son internos.

| Puerto | Servicio | ¿Debe ser accesible desde el celular? |
|---|---|---|
| 3000 | API Gateway (REST + WebSockets) | **Sí** |
| 3001–3005 | Servicios internos | No |
| 5433 | PostgreSQL (Docker) | No (solo tu PC) |

Cómo conectar un **celular físico** con tu PC (se configura en la app, ver su README):

1. **Por USB con ADB reverse (recomendado, más estable):**
   ```bash
   adb reverse tcp:3000 tcp:3000
   ```
   En la app, `HOST = 'localhost'`. No depende de la red ni del firewall.
2. **Por Wi-Fi:** celular y PC en la misma red; en la app, `HOST` = IP de tu PC (`hostname -I`). Abre el puerto en el firewall si hace falta:
   ```bash
   sudo ufw allow 3000/tcp
   ```
3. **Fuera de tu red (demos, pruebas remotas):** un túnel público al puerto 3000, por ejemplo `ngrok http 3000` o `cloudflared tunnel --url http://localhost:3000`. Soportan WebSockets. En ese caso hay que ajustar `GATEWAY` en `src/api/config.ts` de la app a la URL `https` que entrega el túnel.

> En producción usa **HTTPS/WSS** delante del gateway (proxy inverso) y no expongas los puertos internos.

---

## Pruebas

```bash
npm test
```

Ejecuta 19 pruebas del motor de combate (`services/match-service/test/engine.test.js`), con una prueba por regla: fórmula de daño, mínimo 1, efectividad elemental, orden por velocidad, escudos, switch, fase de reemplazo, condición de victoria, abandono y anti-bloqueo de turnos. No requieren base de datos.

---

## API REST

Todas las rutas van por el gateway (`http://HOST:3000`). Salvo `/api/auth/*`, requieren `Authorization: Bearer <jwt>`. Los errores responden `{ "error": "mensaje" }`.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/register` | `{username, email, password}` → `{user, token}` (201). 409 si el email o usuario ya existe. |
| POST | `/api/auth/login` | `{email, password}` → `{user, token}`. 401 si las credenciales son inválidas. |
| GET | `/api/users/me` | Perfil con `wins` y `losses`. |
| GET | `/api/users/me/history?limit=20` | Resultados de las últimas partidas (`WIN`/`LOSS`, rival, fecha). |
| GET | `/api/cards` | Catálogo completo. |
| GET | `/api/cards/:id` | Una carta del catálogo. |
| POST | `/api/cards/scan` | `{nfc_id}` → valida el chip, devuelve la carta y la desbloquea en tu galería (`newly_unlocked`). 404 si el chip no está registrado (carta falsa). |
| GET | `/api/cards/gallery` | Cartas que has escaneado alguna vez. |
| GET | `/api/cards/effectiveness` | Tabla de multiplicadores elementales. |
| GET | `/health` | Estado del gateway (cada servicio tiene el suyo en su puerto). |

Validaciones de registro: usuario de 3 a 30 caracteres (letras, números o `_`), correo válido y contraseña de al menos 6 caracteres. Rate limit: 600 peticiones por 15 min por IP y 40 intentos por 15 min en `/api/auth`.

---

## Protocolo de batalla (WebSockets)

Socket.IO a través del gateway. El JWT va en el handshake: `io(URL, { path, auth: { token }, transports: ['websocket'] })`.

### Cola de emparejamiento — path `/ws/queue`

| Cliente → servidor | Servidor → cliente |
|---|---|
| `join_queue` | `queue_joined {playersInQueue}` |
| `leave_queue` | `queue_error {message}` |
| | `match_found {matchId, opponent: {userId, username}}` |

### Batalla — path `/ws/battle`

| Cliente → servidor | Descripción |
|---|---|
| `match:join {matchId}` | Entra (o reentra tras una desconexión) a la sala. |
| `picks:submit {nfcIds: [5]}` | Confirma el equipo; cada chip se valida contra `nfc_tags`. |
| `battle:action {type}` | `attack`, `shield` o `switch` (con `toIndex`). |
| `match:forfeit` | Abandona la partida. |

| Servidor → cliente | Descripción |
|---|---|
| `match:state` | Vista personalizada de la partida: estado, fase, turno, tus cartas, las del rival (desde que empieza la batalla), escudos, log y ganador. |
| `match:error {code, message}` | Acción rechazada (`NO_MANA`, `NO_SHIELDS`, `UNKNOWN_CARD`, `BAD_DECK`, `ALREADY_CHOSEN`…). |

Estados: `PICKING` → `IN_PROGRESS` (fases `CHOOSING` / `REPLACING`) → `FINISHED` (o `ABANDONED` si ambos se desconectan).

---

## Reglas del juego implementadas

Código en `services/match-service/src/game/engine.js` (módulo puro, sin sockets ni base de datos).

- **Equipo**: 5 cartas escaneadas en la fase Pick; una activa al frente, el resto en la banca.
- **Turnos simultáneos** (estilo Pokémon): ambos eligen en secreto y el servidor resuelve en este orden: **1) switches, 2) escudos, 3) ataques por velocidad** (el más rápido primero; si deja fuera al rival, el ataque del rival no ocurre; empate de velocidad al azar).
- **Escudos**: exactamente **2 por jugador y partida**. Bloquean el 100% del daño entrante de ese turno, sin importar el poder ni el elemento. Se gastan al activarse.
- **Daño**: `Daño = (Poder de Ataque − Defensa del defensor) × Multiplicador elemental`, redondeado y con **mínimo 1** si el ataque conecta. *Poder de Ataque = ataque de la carta + poder de su habilidad.*
- **Efectividad elemental**: ciclo **Agua > Fuego > Planta > Tierra > Aire > Agua** (×2 ventaja, ×0.5 desventaja, ×1 el resto). Se lee de la tabla `element_effectiveness`.
- **Carta caída**: su dueño elige un reemplazo de la banca antes de continuar.
- **Victoria**: gana quien deja a las 5 cartas rivales en 0 HP.
- **Resultado**: al terminar se guarda **solo** el resultado en `match_history` y se actualizan `wins`/`losses`, todo en una transacción.
- **Desconexión**: hay `DISCONNECT_GRACE_SECONDS` para reconectar; si no vuelve, gana el rival. Si se van ambos, la partida se cancela y no se guarda.

### Decisiones que la especificación no definía

Son constantes fáciles de ajustar en `engine.js`:

1. **Turnos simultáneos**: es lo que da sentido al escudo ("anticipar" un ataque).
2. **Maná**: cada carta empieza con su maná, la habilidad cuesta maná y la carta activa recupera `MANA_REGEN_PER_TURN = 1` por turno. Si un jugador no tiene ninguna acción posible (sin maná, sin escudos y sin banca) pierde el turno automáticamente, para que la partida nunca se bloquee.
3. **Poder de Ataque** = `attack + skill_power`.

---

## Modelo de datos

Seis tablas (`init-db.sql`):

| Tabla | Contenido |
|---|---|
| `users` | `id` (UUID), `email`, `username`, `password_hash`, `wins`, `losses`. |
| `cards` | Catálogo: nombre, elemento, `hp`, `mana`, `attack`, `defense`, `speed` y la habilidad (`skill_name`, `skill_mana_cost`, `skill_power`) en la misma tabla, más `image_url`. |
| `element_effectiveness` | Multiplicadores de daño entre elementos. |
| `nfc_tags` | Chip físico (`nfc_id`) → carta del catálogo. **Sin dueños**: solo valida que existe. |
| `user_gallery` | Cartas que cada usuario ha escaneado. |
| `match_history` | Solo resultados finales: jugadores, ganador y fecha. |

Elementos: `FUEGO`, `AGUA`, `AIRE`, `TIERRA`, `PLANTA`.

---

## Estructura del repositorio

```
arkana-backend/
├── docker-compose.yml        # PostgreSQL (puerto 5433)
├── init-db.sql               # Esquema + efectividad elemental + 10 cartas de ejemplo
├── seed-cartas.sql           # Cartas reales + chips NFC
├── .env.example              # Plantilla de variables de entorno
├── package.json              # Workspaces y scripts
├── scripts/
│   └── register-tag.js       # Herramienta para registrar chips NFC
├── packages/
│   └── shared/               # Pool de BD, JWT, .env, UID NFC, middleware común
└── services/
    ├── api-gateway/          # Proxy, JWT, rate limit, WebSockets
    ├── auth-service/         # Registro y login
    ├── user-service/         # Perfil e historial
    ├── card-service/         # Catálogo, escaneo NFC, galería
    ├── matchmaking-service/  # Cola de emparejamiento
    └── match-service/        # Motor de combate, sockets, pruebas
        ├── src/game/         # engine.js (reglas), manager.js (ciclo de vida), view.js
        └── test/             # engine.test.js
```

---

## Solución de problemas

| Síntoma | Causa y solución |
|---|---|
| `No such container: arkana_db` | Nunca se creó. Ejecuta `docker compose up -d` dentro del repo. |
| `container ... is not running` | Está detenido. `docker logs arkana_db --tail 30` muestra el motivo; luego `docker compose up -d`. |
| `ports are not available … 5432 … address already in use` | Otro PostgreSQL usa ese puerto. Usa el **5433** como indica este README, o detén el otro (`sudo systemctl stop postgresql`). |
| `relation "users" does not exist` | La base se creó sin el esquema. `docker compose down -v && docker compose up -d`, vuelve a cargar el seed y reinicia los servicios. |
| `ECONNREFUSED 127.0.0.1:5433` | La base no está levantada o `DB_PORT` no coincide con el puerto publicado. |
| El gateway responde `401` | Falta el header `Authorization: Bearer <token>` o el token expiró (duran 7 días). |
| `Carta no reconocida` al escanear | El chip no está en `nfc_tags`. Carga `seed-cartas.sql` o registra el UID con `npm run tag:register`. Si el UID que lee el teléfono difiere del impreso, registra el que lee el teléfono. |
| `Ya tienes una partida en curso` | Cerraste la app en mitad de una partida. Se libera sola tras `DISCONNECT_GRACE_SECONDS` (30 s). |
| `JWT_SECRET es obligatorio en producción` | Con `NODE_ENV=production` hay que definir `JWT_SECRET` e `INTERNAL_API_KEY` en `.env`. |
| `npm audit` reporta vulnerabilidades en `braces` | Vienen de `nodemon` y del proxy, son de herramientas de desarrollo y no se explotan con entrada de usuarios. |

---

## Flujo de trabajo con Git

- `main`: versión estable.
- `develop`: integración. Las ramas de trabajo (`feat/…`, `fix/…`) salen de `develop` y vuelven por Pull Request.
- Flujo de release: `develop` → Pull Request → `main`.
- Convención de commits: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `refactor:`.
