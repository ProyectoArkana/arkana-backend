const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Limite de peticiones (100 por cada 15 min)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas peticiones desde esta IP, intente de nuevo más tarde.' }
});
app.use(limiter);

const proxyOptions = (target) => ({
  target,
  changeOrigin: true,
  on: {
    proxyReq: fixRequestBody
  }
});

// 1. Auth Service (Puerto 3001)
app.use(
  '/api/auth',
  createProxyMiddleware({
    ...proxyOptions(process.env.AUTH_SERVICE_URL || 'http://127.0.0.1:3001'),
    pathRewrite: { '^/api/auth': '' }
  })
);

// 2. User Service (Puerto 3002)
app.use(
  '/api/users',
  createProxyMiddleware({
    ...proxyOptions(process.env.USER_SERVICE_URL || 'http://127.0.0.1:3002'),
    pathRewrite: { '^/api/users': '' }
  })
);

// 3. Cards Service (Puerto 3003)
app.use(
  '/api/cards',
  createProxyMiddleware({
    ...proxyOptions(process.env.CARDS_SERVICE_URL || process.env.CARD_SERVICE_URL || 'http://127.0.0.1:3003'),
    pathRewrite: { '^/api/cards': '' }
  })
);

// 4. Match Service (Puerto 3004)
app.use(
  '/api/matches',
  createProxyMiddleware({
    ...proxyOptions(process.env.MATCH_SERVICE_URL || 'http://127.0.0.1:3004'),
    pathRewrite: { '^/api/matches': '' }
  })
);

app.get('/health', (req, res) => {
  res.json({ service: 'api-gateway', status: 'up' });
});

app.listen(PORT, () => {
  console.log(`[api-gateway] escuchando peticiones en el puerto ${PORT}`);
});
