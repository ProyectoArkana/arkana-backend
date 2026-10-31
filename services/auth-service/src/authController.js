const bcrypt = require('bcryptjs');
const { getPool, signToken, serverError } = require('@arkana/shared');

const pool = getPool();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[A-Za-z0-9_]{3,30}$/;

const publicUser = (u) => ({ id: u.id, email: u.email, username: u.username, role: u.role });

exports.register = async (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email y password son obligatorios' });
  }
  if (!USERNAME_REGEX.test(username)) {
    return res
      .status(400)
      .json({ error: 'El username debe tener de 3 a 30 caracteres (letras, números o guion bajo)' });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Ingresa un correo válido' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (email, username, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, username, role`,
      [email, username, passwordHash],
    );

    const user = rows[0];
    return res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user: publicUser(user),
      token: signToken(user),
    });
  } catch (error) {
    // 23505 = unique_violation (email o username repetido); lo resuelve la BD, sin carreras
    if (error.code === '23505') {
      return res.status(409).json({ error: 'El email o username ya se encuentra registrado' });
    }
    return serverError(res, 'auth.register', error);
  }
};

exports.login = async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, email, username, role, password_hash FROM users WHERE email = $1',
      [email],
    );
    const user = rows[0];

    // Mismo mensaje si el correo no existe o la clave falla (no revela qué correos hay registrados)
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    return res.json({
      message: 'Inicio de sesión exitoso',
      user: publicUser(user),
      token: signToken(user),
    });
  } catch (error) {
    return serverError(res, 'auth.login', error);
  }
};
