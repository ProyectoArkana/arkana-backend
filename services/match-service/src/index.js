const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { loadEnv } = require('@arkana/shared');
loadEnv();

const repo = require('./repository');
const { createMatchManager, ConflictError } = require('./game/manager');
const { registerSockets } = require('./sockets');

const PORT = process.env.MATCH_PORT || 3005;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'arkana_internal_dev_key';
const graceMs = Number(process.env.DISCONNECT_GRACE_SECONDS || 30) * 1000;

if (process.env.NODE_ENV === 'production' && !process.env.INTERNAL_API_KEY) {
  throw new Error('INTERNAL_API_KEY es obligatorio en producción');
}

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
// El path lo enruta el API Gateway (/ws/battle -> este servicio)
const io = new Server(server, { path: '/ws/battle', cors: { origin: '*' } });

let broadcast = () => {};
const manager = createMatchManager({ repo, graceMs, onChange: (match) => broadcast(match) });
broadcast = registerSockets(io, () => manager);

app.get('/health', (req, res) => res.json({ service: 'match-service', status: 'up' }));

// Endpoint INTERNO: solo matchmaking-service lo llama (el gateway no lo expone).
app.post('/internal/matches', async (req, res) => {
  if (req.headers['x-internal-key'] !== INTERNAL_API_KEY) {
    return res.status(403).json({ error: 'Prohibido' });
  }

  const players = req.body?.players;
  const valid =
    Array.isArray(players) &&
    players.length === 2 &&
    players.every((p) => p?.userId && p?.username) &&
    players[0].userId !== players[1].userId;
  if (!valid) return res.status(400).json({ error: 'Se requieren 2 jugadores distintos con userId y username' });

  try {
    const match = await manager.createMatch(
      players.map((p) => ({ userId: String(p.userId), username: String(p.username) })),
    );
    return res.status(201).json({ matchId: match.id });
  } catch (error) {
    if (error instanceof ConflictError) {
      return res.status(409).json({ error: error.message, conflictUserId: error.userId });
    }
    console.error('[match-service] error al crear partida:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

server.listen(PORT, () => console.log(`[match-service] corriendo en el puerto ${PORT} (HTTP + WebSockets)`));
