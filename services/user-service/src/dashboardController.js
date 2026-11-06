const { getPool, serverError } = require('@arkana/shared');

const pool = getPool();

const RECENT_MATCHES = 5;

// Panel principal: resumen del jugador autenticado en UNA sola petición.
//   - user:           nombre, rol y estadísticas (victorias/derrotas)
//   - collection:     cartas vinculadas (user_gallery) vs total del catálogo
//   - deck:           mazo activo (user_decks) o null si no tiene
//   - recent_matches: últimos 5 combates (match_history) con oponente y resultado
// Las 4 consultas son independientes, así que se lanzan en paralelo.
exports.getDashboard = async (req, res) => {
  const userId = req.userId;

  try {
    const [userRes, collectionRes, deckRes, matchesRes] = await Promise.all([
      pool.query('SELECT id, username, role, wins, losses FROM users WHERE id = $1', [userId]),
      pool.query(
        `SELECT (SELECT count(*) FROM cards)::int AS total,
                (SELECT count(*) FROM user_gallery WHERE user_id = $1)::int AS unlocked`,
        [userId],
      ),
      pool.query(
        `SELECT c.id, c.name, c.element, c.rarity, c.hp, c.attack, c.defense, c.image_url,
                dc.position, d.updated_at
         FROM user_decks d
         JOIN user_deck_cards dc ON dc.user_id = d.user_id
         JOIN cards c ON c.id = dc.card_id
         WHERE d.user_id = $1
         ORDER BY dc.position`,
        [userId],
      ),
      pool.query(
        `SELECT h.id,
                h.played_at,
                (h.winner_id = $1) AS won,
                opp.id             AS opponent_id,
                opp.username       AS opponent_username
         FROM match_history h
         JOIN users opp
           ON opp.id = CASE WHEN h.player1_id = $1 THEN h.player2_id ELSE h.player1_id END
         WHERE h.player1_id = $1 OR h.player2_id = $1
         ORDER BY h.played_at DESC
         LIMIT $2`,
        [userId, RECENT_MATCHES],
      ),
    ]);

    if (userRes.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    const deckRows = deckRes.rows;
    const deck =
      deckRows.length > 0
        ? {
            size: deckRows.length,
            updated_at: deckRows[0].updated_at,
            cards: deckRows.map(({ updated_at, ...card }) => card),
          }
        : null;

    // Datos siempre frescos: el panel no debe servirse desde caché
    res.set('Cache-Control', 'no-store');
    return res.json({
      user: userRes.rows[0],
      collection: collectionRes.rows[0],
      deck,
      recent_matches: matchesRes.rows.map((r) => ({
        id: r.id,
        played_at: r.played_at,
        result: r.won ? 'WIN' : 'LOSS',
        opponent: { id: r.opponent_id, username: r.opponent_username },
      })),
    });
  } catch (error) {
    return serverError(res, 'user.getDashboard', error);
  }
};
