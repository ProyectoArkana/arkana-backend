const { verifyToken: verifyJwt } = require('@arkana/shared');

// Verifica el JWT y deja la identidad en x-user-id para los servicios internos.
const verifyToken = (req, res, next) => {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
  }

  try {
    const { userId, username } = verifyJwt(token);
    req.headers['x-user-id'] = userId;
    if (username) req.headers['x-username'] = String(username);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
};

module.exports = { verifyToken };
