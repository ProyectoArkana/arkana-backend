// Acceso a PostgreSQL de match-service. Los equipos de batalla NO se guardan:
// solo se leen cartas del catálogo, se desbloquea la galería y se registra el resultado final.
const { getPool } = require('@arkana/shared');

const pool = getPool();

async function loadEffectiveness() {
  const { rows } = await pool.query('SELECT attacker, defender, multiplier FROM element_effectiveness');
  return rows;
}

// Devuelve { [nfc_id]: filaDeCarta } para los chips que existen (los demás son cartas falsas).
async function findCardsByNfcIds(nfcIds) {
  const { rows } = await pool.query(
    `SELECT t.nfc_id, c.*
     FROM nfc_tags t
     JOIN cards c ON c.id = t.card_id
     WHERE t.nfc_id = ANY($1::text[])`,
    [nfcIds],
  );
  return Object.fromEntries(rows.map((r) => [r.nfc_id, r]));
}

// Escanear una carta nueva desbloquea su registro en la galería del usuario.
async function unlockCards(userId, cardIds) {
  await pool.query(
    `INSERT INTO user_gallery (user_id, card_id)
     SELECT $1, unnest($2::int[])
     ON CONFLICT (user_id, card_id) DO NOTHING`,
    [userId, cardIds],
  );
}

// Historial (solo resultado final) + victorias/derrotas, todo en una transacción.
async function saveResult(match) {
  const [player1, player2] = match.order;
  const loser = match.winnerId === player1 ? player2 : player1;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO match_history (player1_id, player2_id, winner_id) VALUES ($1, $2, $3)',
      [player1, player2, match.winnerId],
    );
    await client.query('UPDATE users SET wins = wins + 1 WHERE id = $1', [match.winnerId]);
    await client.query('UPDATE users SET losses = losses + 1 WHERE id = $1', [loser]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { loadEffectiveness, findCardsByNfcIds, unlockCards, saveResult };
