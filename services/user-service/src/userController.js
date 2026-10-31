const { getPool, serverError } = require('@arkana/shared');

const pool = getPool();

// Perfil + estadísticas básicas del usuario autenticado
exports.getMe = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, email, role, wins, losses, created_at FROM users WHERE id = $1',
      [req.userId],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    return res.json(rows[0]);
  } catch (error) {
    return serverError(res, 'user.getMe', error);
  }
};

// Historial de partidas (solo resultados finales)
exports.getMyHistory = async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

  try {
    const { rows } = await pool.query(
      `SELECT h.id,
              h.played_at,
              (h.winner_id = $1) AS won,
              opp.username       AS opponent_username
       FROM match_history h
       JOIN users opp
         ON opp.id = CASE WHEN h.player1_id = $1 THEN h.player2_id ELSE h.player1_id END
       WHERE h.player1_id = $1 OR h.player2_id = $1
       ORDER BY h.played_at DESC
       LIMIT $2`,
      [req.userId, limit],
    );

    return res.json(
      rows.map((r) => ({
        id: r.id,
        opponent_username: r.opponent_username,
        result: r.won ? 'WIN' : 'LOSS',
        played_at: r.played_at,
      })),
    );
  } catch (error) {
    return serverError(res, 'user.getMyHistory', error);
  }
};
