const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
require('dotenv').config();

const { verifyToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Limite de peticiones de seguridad
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas peticiones desde esta IP.' }
});
app.use(limiter);

// ==========================================
// 1. Auth Service (Puerto 3001) - Públicas
// ==========================================
app.use(
  '/api/auth',
  createProxyMiddleware({
    target: process.env.AUTH_SERVICE_URL || 'http://127.0.0.1:3001',
    changeOrigin: true,
    pathRewrite: { '^/api/auth': '' },
    on: { proxyReq: fixRequestBody }
  })
);

// ==========================================
// 2. User Service (Puerto 3002) - Protegidas
// ==========================================
app.use(
  '/api/users',
  verifyToken, // Aquí inyectas los headers en req.headers
  createProxyMiddleware({
    target: process.env.USER_SERVICE_URL || 'http://127.0.0.1:3002',
    changeOrigin: true,
    pathRewrite: { '^/api/users': '' },
    on: {
      proxyReq: (proxyReq, req) => {
        // FORZAMOS la inyección de los headers hacia el microservicio final
        if (req.headers['x-user-id']) {
          proxyReq.setHeader('x-user-id', req.headers['x-user-id']);
        }
        if (req.headers['x-user-email']) {
          proxyReq.setHeader('x-user-email', req.headers['x-user-email']);
        }
        fixRequestBody(proxyReq, req);
      }
    }
  })
);

// ==========================================
// 3. Card Service (Puerto 3003) - Protegidas
// ==========================================
app.use(
  '/api/cards',
  verifyToken,
  createProxyMiddleware({
    target: process.env.CARD_SERVICE_URL || 'http://127.0.0.1:3003',
    changeOrigin: true,
    pathRewrite: { '^/api/cards': '' },
    on: { proxyReq: fixRequestBody }
  })
);

// ==========================================
// 4. Matchmaking Service (Puerto 3004)
// ==========================================
app.use(
  '/api/matchmaking',
  verifyToken,
  createProxyMiddleware({
    target: process.env.MATCHMAKING_SERVICE_URL || 'http://127.0.0.1:3004',
    changeOrigin: true,
    pathRewrite: { '^/api/matchmaking': '' },
    on: { proxyReq: fixRequestBody }
  })
);

// ==========================================
// 5. Match Service (Puerto 3005) - WebSockets
// ==========================================
// Proxy para peticiones HTTP normales a la partida
app.use(
  '/api/match',
  verifyToken,
  createProxyMiddleware({
    target: process.env.MATCH_SERVICE_URL || 'http://127.0.0.1:3005',
    changeOrigin: true,
    pathRewrite: { '^/api/match': '' },
    on: { proxyReq: fixRequestBody }
  })
);

// Proxy ESPECIAL para Socket.io (Ruta por defecto que usa la librería del cliente)
app.use(
  '/socket.io',
  createProxyMiddleware({
    target: process.env.MATCH_SERVICE_URL || 'http://127.0.0.1:3005',
    ws: true, // <-- ESTO ES CLAVE: Permite la conexión WebSocket
    changeOrigin: true
  })
);

// Health check global
app.get('/health', (req, res) => {
  res.json({ service: 'api-gateway', status: 'up', all_routes_configured: true });
});

// Para soportar WebSockets en el Gateway, debemos escuchar el evento "upgrade"
const server = app.listen(PORT, () => {
  console.log(`[api-gateway] Enrutador principal activo en el puerto ${PORT}`);
});

server.on('upgrade', app); // Pasa la mejora de protocolo al middleware de Proxy