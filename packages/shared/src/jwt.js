const jwt = require('jsonwebtoken');
const { loadEnv } = require('./env');

const DEV_FALLBACK_SECRET = 'arkana_secret_key_2026';
const TOKEN_EXPIRES_IN = '7d'; // JWT stateless: sin refresh tokens ni tablas de sesión

function getSecret() {
  loadEnv();
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET es obligatorio en producción');
  }
  return DEV_FALLBACK_SECRET;
}

const signToken = (user) =>
  jwt.sign({ userId: user.id, username: user.username }, getSecret(), {
    expiresIn: TOKEN_EXPIRES_IN,
  });

// Devuelve { userId, username } o lanza si el token no es válido.
function verifyToken(token) {
  const payload = jwt.verify(token, getSecret());
  const userId = payload.userId || payload.id;
  if (!userId) throw new Error('Token sin userId');
  return { userId: String(userId), username: payload.username };
}

module.exports = { signToken, verifyToken };
