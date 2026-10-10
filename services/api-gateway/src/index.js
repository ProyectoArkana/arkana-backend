const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
require('dotenv').config();

const { verifyToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Limite de peticiones (100 por cada 15 min)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas peticiones desde esta IP, intente de nuevo más tarde.' }
});
app.use(limiter);

// 1. Auth Service (Puerto 3001) - Rutas públicas
app.use(
  '/api/auth',
  createProxyMiddleware({
    target: process.env.AUTH_SERVICE_URL || 'http://127.0.0.1:3001',
    changeOrigin: true,
    pathRewrite: {
      '^/api/auth': '' // Remueve /api/auth para enviar /login directamente al puerto 3001
    },
    on: {
      proxyReq: fixRequestBody
    }
  })
);

// 2. User Service (Puerto 3002) - Rutas protegidas
app.use(
  '/api/users',
  verifyToken,
  createProxyMiddleware({
    target: process.env.USER_SERVICE_URL || 'http://127.0.0.1:3002',
    changeOrigin: true,
    pathRewrite: {
      '^/api/users': ''
    },
    on: {
      proxyReq: fixRequestBody
    }
  })
);

// 3. Card Service (Puerto 3003) - Catálogo y Mazos
app.use(
  '/api/cards',
  verifyToken,
  createProxyMiddleware({
    target: process.env.CARD_SERVICE_URL || 'http://127.0.0.1:3003',
    changeOrigin: true,
    pathRewrite: {
      '^/api/cards': ''
    },
    on: {
      proxyReq: fixRequestBody
    }
  })
);

app.get('/health', (req, res) => {
  res.json({ service: 'api-gateway', status: 'up' });
});

app.listen(PORT, () => {
  console.log(`[api-gateway] escuchando peticiones en el puerto ${PORT}`);
});