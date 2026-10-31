const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { loadEnv } = require('@arkana/shared');
loadEnv();

const { verifyToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.GATEWAY_PORT || 3000;

const URLS = {
  auth: process.env.AUTH_SERVICE_URL || 'http://127.0.0.1:3001',
  users: process.env.USER_SERVICE_URL || 'http://127.0.0.1:3002',
  cards: process.env.CARD_SERVICE_URL || 'http://127.0.0.1:3003',
  queue: process.env.MATCHMAKING_SERVICE_URL || 'http://127.0.0.1:3004',
  battle: process.env.MATCH_SERVICE_URL || 'http://127.0.0.1:3005',
};

app.disable('x-powered-by');
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'] }));

// Seguridad: la identidad SOLO la pone este gateway a partir del JWT.
// Cualquier x-user-id que traiga el cliente se descarta antes de llegar a los servicios.
app.use((req, res, next) => {
  delete req.headers['x-user-id'];
  delete req.headers['x-username'];
  delete req.headers['x-internal-key'];
  next();
});

// Nota: no se usa express.json() aquí; el gateway reenvía el cuerpo tal cual (streaming).
const general = rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, message: { error: 'Demasiadas peticiones desde esta IP.' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, message: { error: 'Demasiados intentos. Espera unos minutos.' } });
app.use('/api', general);

const http = (target) => ({ target, changeOrigin: true });

// REST ---------------------------------------------------------------------------------------
app.use('/api/auth', authLimiter, createProxyMiddleware({ ...http(URLS.auth), pathRewrite: { '^/api/auth': '' } }));
app.use('/api/users', verifyToken, createProxyMiddleware({ ...http(URLS.users), pathRewrite: { '^/api/users': '' } }));
app.use('/api/cards', verifyToken, createProxyMiddleware({ ...http(URLS.cards), pathRewrite: { '^/api/cards': '' } }));
// Administración de usuarios y roles (user-service valida en la BD que quien llama sea ADMIN)
app.use('/api/admin', verifyToken, createProxyMiddleware({
  target: URLS.users,
  changeOrigin: true,
  pathRewrite: (path) => `/admin${path}`, // Forzamos el /admin al inicio
}));

// WebSockets (Socket.IO): cada servicio valida el JWT en el handshake ------------------------
//   /ws/queue  -> matchmaking-service (cola)      /ws/battle -> match-service (batalla)
const wsProxy = (path, target) => createProxyMiddleware({ ...http(target), ws: true, pathFilter: path });
const queueProxy = wsProxy('/ws/queue', URLS.queue);
const battleProxy = wsProxy('/ws/battle', URLS.battle);
app.use(queueProxy);
app.use(battleProxy);

app.get('/health', (req, res) => res.json({ service: 'api-gateway', status: 'up' }));

// Escuchar en 0.0.0.0 para aceptar tráfico de la red local / túnel ADB
const server = app.listen(PORT, '0.0.0.0', () => console.log(`[api-gateway] escuchando en el puerto ${PORT}`));

// Los upgrades a WebSocket no pasan por Express: se enrutan a mano por path
server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/ws/queue')) return queueProxy.upgrade(req, socket, head);
  if (req.url.startsWith('/ws/battle')) return battleProxy.upgrade(req, socket, head);
  socket.destroy();
});
