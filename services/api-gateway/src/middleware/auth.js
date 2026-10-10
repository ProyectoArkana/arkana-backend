const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'arkana_secret_key_2026';

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Formato: "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.headers['x-user-id'] = verified.userId;
    req.headers['x-user-name'] = verified.username;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Token inválido o expirado.' });
  }
};

module.exports = { verifyToken };