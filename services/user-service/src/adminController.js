const bcrypt = require('bcryptjs');
const { getPool, serverError } = require('@arkana/shared');

const pool = getPool();

const ROLES = ['PLAYER', 'ADMIN'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[A-Za-z0-9_]{3,30}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Nunca se devuelve password_hash
const USER_COLUMNS = 'id, username, email, role, wins, losses, created_at';

// Escapa % _ \ para que el texto buscado se tome literal dentro de un LIKE
const escapeLike = (value) => value.replace(/[\\%_]/g, '\\$&');

// El rol se consulta en la BD en cada petición (no se confía en el JWT): si a alguien le quitan
// el rol ADMIN, pierde el acceso de inmediato y no hasta que su token venza.
// Debe ir DESPUÉS de requireUser (que pone req.userId a partir del gateway).
exports.requireAdmin = async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT role FROM users WHERE id = $1', [req.userId]);
    if (rows.length === 0 || rows[0].role !== 'ADMIN') {
      return res.status(403).json({ error: 'Se requiere rol de administrador' });
    }
    return next();
  } catch (error) {
    return serverError(res, 'admin.requireAdmin', error);
  }
};

// GET /admin/users?search=&role=&limit=&offset=
exports.listUsers = async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const search = String(req.query.search ?? '').trim().slice(0, 50);
  const role = String(req.query.role ?? '').trim().toUpperCase();

  const where = [];
  const params = [];
  if (search) {
    params.push(`%${escapeLike(search)}%`);
    where.push(`(username ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }
  if (role) {
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Rol inválido' });
    params.push(role);
    where.push(`role = $${params.length}`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const count = await pool.query(`SELECT count(*)::int AS total FROM users ${clause}`, params);
    const { rows } = await pool.query(
      `SELECT ${USER_COLUMNS} FROM users ${clause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    return res.json({ users: rows, total: count.rows[0].total, limit, offset });
  } catch (error) {
    return serverError(res, 'admin.listUsers', error);
  }
};

// GET /admin/users/:id
exports.getUser = async (req, res) => {
  const { id } = req.params;
  if (!UUID_REGEX.test(id)) return res.status(400).json({ error: 'id inválido' });

  try {
    const { rows } = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    return res.json({ user: rows[0] });
  } catch (error) {
    return serverError(res, 'admin.getUser', error);
  }
};

// POST /admin/users  { username, email, password, role? }
exports.createUser = async (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  const role = String(req.body?.role ?? 'PLAYER').trim().toUpperCase();

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email y password son obligatorios' });
  }
  if (!USERNAME_REGEX.test(username)) {
    return res
      .status(400)
      .json({ error: 'El username debe tener de 3 a 30 caracteres (letras, números o guion bajo)' });
  }
  if (!EMAIL_REGEX.test(email)) return res.status(400).json({ error: 'Ingresa un correo válido' });
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Rol inválido' });

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (email, username, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING ${USER_COLUMNS}`,
      [email, username, passwordHash, role],
    );
    return res.status(201).json({ user: rows[0] });
  } catch (error) {
    // 23505 = unique_violation (email o username repetido)
    if (error.code === '23505') {
      return res.status(409).json({ error: 'El email o username ya se encuentra registrado' });
    }
    return serverError(res, 'admin.createUser', error);
  }
};

// PATCH /admin/users/:id/role  { role }
exports.setRole = async (req, res) => {
  const { id } = req.params;
  const role = String(req.body?.role ?? '').trim().toUpperCase();

  if (!UUID_REGEX.test(id)) return res.status(400).json({ error: 'id inválido' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Rol inválido' });
  // Evita quedarse sin administradores por accidente
  if (id === req.userId) return res.status(400).json({ error: 'No puedes cambiar tu propio rol' });

  try {
    const { rows } = await pool.query(
      `UPDATE users SET role = $2 WHERE id = $1 RETURNING ${USER_COLUMNS}`,
      [id, role],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    return res.json({ user: rows[0] });
  } catch (error) {
    return serverError(res, 'admin.setRole', error);
  }
};
