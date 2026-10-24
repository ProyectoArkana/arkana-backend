const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { loadEnv, verifyToken } = require('@arkana/shared');
loadEnv();

const { createQueue } = require('./queue');

const PORT = process.env.MATCHMAKING_PORT || 3004;
const MATCH_SERVICE_URL = process.env.MATCH_SERVICE_URL || 'http://127.0.0.1:3005';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'arkana_internal_dev_key';

if (process.env.NODE_ENV === 'production' && !process.env.INTERNAL_API_KEY) {
  throw new Error('INTERNAL_API_KEY es obligatorio en producción');
}

const app = express();
app.use(cors());
app.get('/health', (req, res) => res.json({ service: 'matchmaking-service', status: 'up' }));

const server = http.createServer(app);
// El path lo enruta el API Gateway (/ws/queue -> este servicio)
const io = new Server(server, { path: '/ws/queue', cors: { origin: '*' } });

// Pide a match-service que cree la sala 1 vs 1 y devuelve su id
async function createMatch([a, b]) {
  const response = await fetch(`${MATCH_SERVICE_URL}/internal/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-key': INTERNAL_API_KEY },
    body: JSON.stringify({
      players: [
        { userId: a.userId, username: a.username },
        { userId: b.userId, username: b.username },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `match-service respondió ${response.status}`);
    error.status = response.status;
    error.conflictUserId = data.conflictUserId;
    throw error;
  }
  return data.matchId;
}

const queue = createQueue({
  createMatch,
  notify: (entry, event, payload) => io.to(entry.socketId).emit(event, payload),
});

// La identidad sale del JWT, nunca de lo que mande el cliente
io.use((socket, next) => {
  try {
    socket.data.user = verifyToken(socket.handshake.auth?.token);
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  const { userId, username } = socket.data.user;

  socket.on('join_queue', () => queue.join({ userId, username, socketId: socket.id }));
  socket.on('leave_queue', () => queue.leave(userId, socket.id));
  socket.on('disconnect', () => queue.leave(userId, socket.id));
});

server.listen(PORT, () => console.log(`[matchmaking-service] corriendo en el puerto ${PORT}`));
