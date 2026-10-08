<<<<<<< HEAD
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
=======
>>>>>>> origin/develop
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

<<<<<<< HEAD
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
=======
>>>>>>> origin/develop
exports.register = async (req, res) => {
  const { username, email, password } = req.body;
  
  try {
<<<<<<< HEAD
    const userCheck = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'El email o username ya se encuentra registrado' });
=======
    const userExist = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userExist.rows.length > 0) {
      return res.status(400).json({ error: 'El correo ya está registrado' });
>>>>>>> origin/develop
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

<<<<<<< HEAD
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
=======
    const newUserQuery = `
      INSERT INTO users (username, email, password) 
      VALUES ($1, $2, $3) 
      RETURNING id, username, email;
    `;
    const newUserResult = await pool.query(newUserQuery, [username, email, hashedPassword]);
    const user = newUserResult.rows[0];

    // Crear su perfil gemelo automáticamente
    await pool.query(
      `INSERT INTO profiles (user_id) VALUES ($1)`,
      [user.id]
    );

    res.status(201).json({ 
      message: 'Usuario registrado exitosamente', 
      user: { id: user.id, username: user.username, email: user.email } 
>>>>>>> origin/develop
    });

  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error interno del servidor al registrar' });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
<<<<<<< HEAD
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
=======
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'Credenciales inválidas' });
    }

    const user = userResult.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || 'secreto_super_seguro', {
      expiresIn: '7d',
>>>>>>> origin/develop
    });

    res.json({ message: 'Login exitoso', token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error del servidor' });
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
