# Guía de uso: historial de combates

Documentación del historial entregado en el Sprint 7. Sirve al jugador final, al equipo y a soporte.

Toda consulta pasa por el API Gateway en `http://localhost:3000`. Requiere sesión (JWT).

## 1. Iniciar sesión

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"jugador@arkana.com\",\"password\":\"tu_password\"}"
```

Copia el `token` de la respuesta. Úsalo en las siguientes llamadas:

`Authorization: Bearer <token>`

## 2. Ver mis combates

```bash
curl http://localhost:3000/api/matches \
  -H "Authorization: Bearer <token>"
```

Solo aparecen las partidas donde el jugador es `player1_id` o `player2_id`, de la más reciente a la más antigua.

Para ver solo combates terminados:

```bash
curl "http://localhost:3000/api/matches?status=finished" \
  -H "Authorization: Bearer <token>"
```

| Campo | Qué significa |
|---|---|
| `id` | Identificador de la partida |
| `player1_id` / `player2_id` | Tú y el rival |
| `status` | `waiting`, `active`, `finished` o `cancelled` |
| `winner_id` | Ganador. Si es tu id: victoria. Si es el rival: derrota. Si viene vacío: sin ganador |
| `started_at` / `finished_at` | Fecha de inicio y de cierre |

## 3. Ver el detalle de una partida

```bash
curl http://localhost:3000/api/matches/<match_id> \
  -H "Authorization: Bearer <token>"
```

## 4. Ver eventos y cartas escaneadas

Útil para soporte o para reconstruir qué pasó en el combate.

```bash
curl http://localhost:3000/api/matches/<match_id>/events \
  -H "Authorization: Bearer <token>"

curl http://localhost:3000/api/matches/<match_id>/scans \
  -H "Authorization: Bearer <token>"
```

## 5. Resumen de victorias y derrotas

```bash
curl http://localhost:3000/api/users/me \
  -H "Authorization: Bearer <token>"
```

El perfil incluye `wins`, `losses` y `trophies`.

## Errores frecuentes

- **401**: falta el token o la sesión expiró. Vuelve a iniciar sesión.
- **403**: esa partida no es tuya.
- **404**: el `match_id` no existe.

Si no hay partidas, la lista `matches` llega vacía.
