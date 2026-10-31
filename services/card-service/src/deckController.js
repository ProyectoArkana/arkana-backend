const { getPool, serverError } = require('@arkana/shared');

const pool = getPool();

const DECK_SIZE = 5;
const MAX_IDS = DECK_SIZE * 4; // tope para no consultar la BD con listas enormes

const CARD_COLUMNS = `c.id, c.name, c.element, c.rarity, c.hp, c.mana, c.attack, c.defense, c.speed,
                      c.skill_name, c.skill_mana_cost, c.skill_power, c.image_url`;

// Reglas del mazo activo (ARK-020):
//  1) exactamente 5 cartas, 2) sin repetir, 3) todas existen en el catálogo,
//  4) todas están en la colección del usuario (user_gallery).
// Devuelve TODOS los errores encontrados, no solo el primero.
async function validateDeck(userId, cardIds) {
  if (!Array.isArray(cardIds) || cardIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    return [{ code: 'DECK_FORMAT', message: 'card_ids debe ser una lista de ids de carta (enteros positivos)' }];
  }

  const errors = [];
  if (cardIds.length !== DECK_SIZE) {
    errors.push({
      code: 'DECK_SIZE',
      message: `El mazo debe tener exactamente ${DECK_SIZE} cartas (recibidas ${cardIds.length})`,
    });
  }
  if (cardIds.length === 0 || cardIds.length > MAX_IDS) return errors;

  const unique = [...new Set(cardIds)];
  const found = await pool.query('SELECT id, name FROM cards WHERE id = ANY($1::int[])', [unique]);
  const names = new Map(found.rows.map((r) => [r.id, r.name]));
  const label = (id) => (names.has(id) ? `«${names.get(id)}»` : `La carta ${id}`);

  for (const id of new Set(cardIds.filter((x, i) => cardIds.indexOf(x) !== i))) {
    errors.push({ code: 'DECK_DUPLICATE', message: `${label(id)} está repetida`, card_id: id });
  }
  for (const id of unique.filter((x) => !names.has(x))) {
    errors.push({ code: 'CARD_NOT_FOUND', message: `La carta ${id} no existe`, card_id: id });
  }

  const owned = await pool.query(
    'SELECT card_id FROM user_gallery WHERE user_id = $1 AND card_id = ANY($2::int[])',
    [userId, unique],
  );
  const ownedIds = new Set(owned.rows.map((r) => r.card_id));
  for (const id of unique.filter((x) => names.has(x) && !ownedIds.has(x))) {
    errors.push({
      code: 'CARD_NOT_UNLOCKED',
      message: `${label(id)} aún no está vinculada a tu colección`,
      card_id: id,
    });
  }
  return errors;
}

async function loadActiveDeck(userId) {
  const { rows } = await pool.query(
    `SELECT ${CARD_COLUMNS}, dc.position, d.updated_at
     FROM user_decks d
     JOIN user_deck_cards dc ON dc.user_id = d.user_id
     JOIN cards c ON c.id = dc.card_id
     WHERE d.user_id = $1
     ORDER BY dc.position`,
    [userId],
  );
  if (rows.length === 0) return null;
  return {
    cards: rows.map(({ updated_at, ...card }) => card),
    updated_at: rows[0].updated_at,
  };
}

const invalid = (res, errors) =>
  res.status(422).json({ error: errors.map((e) => e.message).join('. '), errors });

// GET /decks/active -> { deck: null | { cards: [5 cartas con position], updated_at } }
exports.getActiveDeck = async (req, res) => {
  try {
    return res.json({ deck: await loadActiveDeck(req.userId) });
  } catch (error) {
    return serverError(res, 'decks.getActiveDeck', error);
  }
};

// POST /decks/validate { card_ids } -> { valid, errors } (no guarda nada)
exports.validateDeckRequest = async (req, res) => {
  try {
    const errors = await validateDeck(req.userId, req.body?.card_ids);
    return res.json({ valid: errors.length === 0, errors });
  } catch (error) {
    return serverError(res, 'decks.validate', error);
  }
};

// PUT /decks/active { card_ids } -> valida en el servidor y reemplaza el mazo en una transacción
exports.saveActiveDeck = async (req, res) => {
  const cardIds = req.body?.card_ids;
  let client;
  try {
    const errors = await validateDeck(req.userId, cardIds);
    if (errors.length > 0) return invalid(res, errors);

    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO user_decks (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET updated_at = now()`,
      [req.userId],
    );
    await client.query('DELETE FROM user_deck_cards WHERE user_id = $1', [req.userId]);
    await client.query(
      `INSERT INTO user_deck_cards (user_id, position, card_id)
       SELECT $1, t.position, t.card_id
       FROM unnest($2::int[]) WITH ORDINALITY AS t(card_id, position)`,
      [req.userId, cardIds],
    );
    await client.query('COMMIT');

    return res.json({ deck: await loadActiveDeck(req.userId) });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return serverError(res, 'decks.saveActiveDeck', error);
  } finally {
    if (client) client.release();
  }
};

// DELETE /decks/active -> quita el mazo activo
exports.clearActiveDeck = async (req, res) => {
  try {
    await pool.query('DELETE FROM user_decks WHERE user_id = $1', [req.userId]);
    return res.status(204).end();
  } catch (error) {
    return serverError(res, 'decks.clearActiveDeck', error);
  }
};
