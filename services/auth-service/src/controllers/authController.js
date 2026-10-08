const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'arkana_secret_key_2026';
const ACCESS_TOKEN_EXPIRES = process.env.ACCESS_TOKEN_EXPIRES || '1d';
const REFRESH_TOKEN_DAYS = Number(process.env.REFRESH_TOKEN_DAYS || 30);

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const createAccessToken = (user) =>
  jwt.sign(
    { userId: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES }
  );

const createRefreshToken = async (userId) => {
  const refreshToken = crypto.randomBytes(48).toString('hex');
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS);

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );

  return refreshToken;
};

const ensureProfile = async (userId) => {
  await pool.query(
    `INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
};

// REGISTRO DE USUARIO
exports.register = async (req, res) => {
  const { email, username, password } = req.body;

  if (!email || !username || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  try {
    const userCheck = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'El email o username ya se encuentra registrado' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await pool.query(
      'INSERT INTO users (email, username, password_hash) VALUES ($1, $2, $3) RETURNING id, email, username, created_at',
      [email, username, passwordHash]
    );

    const user = newUser.rows[0];
    await ensureProfile(user.id);

    const token = createAccessToken(user);
    const refreshToken = await createRefreshToken(user.id);

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user,
      token,
      refresh_token: refreshToken
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// LOGIN DE USUARIO
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }

  try {
    const userQuery = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userQuery.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = userQuery.rows[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    await ensureProfile(user.id);

    const token = createAccessToken(user);
    const refreshToken = await createRefreshToken(user.id);

    res.json({
      message: 'Inicio de sesión exitoso',
      user: {
        id: user.id,
        email: user.email,
        username: user.username
      },
      token,
      refresh_token: refreshToken
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// REFRESCAR ACCESS TOKEN
exports.refresh = async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: 'refresh_token es obligatorio' });
  }

  try {
    const tokenHash = hashToken(refresh_token);
    const result = await pool.query(
      `SELECT rt.*, u.id AS uid, u.username, u.email
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Refresh token inválido' });
    }

    const row = result.rows[0];

    if (row.revoked_at) {
      return res.status(401).json({ error: 'Refresh token revocado' });
    }
    if (new Date(row.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Refresh token expirado' });
    }

    const user = { id: row.uid, username: row.username, email: row.email };
    const token = createAccessToken(user);

    res.json({
      message: 'Token renovado',
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username
      }
    });
  } catch (error) {
    console.error('Error en refresh:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// LOGOUT (revocar refresh token)
exports.logout = async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: 'refresh_token es obligatorio' });
  }

  try {
    const tokenHash = hashToken(refresh_token);
    await pool.query(
      `UPDATE refresh_tokens
       SET revoked_at = now()
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash]
    );

    res.json({ message: 'Sesión cerrada' });
  } catch (error) {
    console.error('Error en logout:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
