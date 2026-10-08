const pool = require('../config/db');

const getUserId = (req) => req.headers['x-user-id'];

// Obtener o crear perfil del usuario autenticado
exports.getMyProfile = async (req, res) => {
  const userId = getUserId(req);

  if (!userId) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }

  try {
    let result = await pool.query('SELECT * FROM profiles WHERE user_id = $1', [userId]);

    if (result.rows.length === 0) {
      result = await pool.query(
        `INSERT INTO profiles (user_id, avatar_url, trophies, wins, losses)
         VALUES ($1, NULL, 0, 0, 0)
         RETURNING *`,
        [userId]
      );
    }

    res.json({ profile: result.rows[0] });
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener perfil por user_id
exports.getProfileById = async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query('SELECT * FROM profiles WHERE user_id = $1', [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    res.json({ profile: result.rows[0] });
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Actualizar avatar del perfil autenticado
exports.updateMyProfile = async (req, res) => {
  const userId = getUserId(req);
  const { avatar_url } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }

  try {
    await pool.query(
      `INSERT INTO profiles (user_id, avatar_url, trophies, wins, losses)
       VALUES ($1, $2, 0, 0, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, avatar_url || null]
    );

    const result = await pool.query(
      `UPDATE profiles SET avatar_url = COALESCE($1, avatar_url)
       WHERE user_id = $2
       RETURNING *`,
      [avatar_url, userId]
    );

    res.json({ message: 'Perfil actualizado', profile: result.rows[0] });
  } catch (error) {
    console.error('Error al actualizar perfil:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Actualizar estadísticas (usado por match-service)
exports.updateStats = async (req, res) => {
  const { userId } = req.params;
  const { trophies, wins, losses } = req.body;

  if (trophies === undefined && wins === undefined && losses === undefined) {
    return res.status(400).json({ error: 'Debe enviar al menos un campo de estadística' });
  }

  try {
    const result = await pool.query(
      `UPDATE profiles SET
         trophies = COALESCE($1, trophies),
         wins = COALESCE($2, wins),
         losses = COALESCE($3, losses)
       WHERE user_id = $4
       RETURNING *`,
      [trophies, wins, losses, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    res.json({ message: 'Estadísticas actualizadas', profile: result.rows[0] });
  } catch (error) {
    console.error('Error al actualizar estadísticas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
