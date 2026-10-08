const pool = require('../config/db');

const getUserId = (req) => req.headers['x-user-id'];

// Catálogo de cartas
exports.listCards = async (req, res) => {
  try {
    const { element, rarity } = req.query;
    let query = 'SELECT * FROM cards WHERE 1=1';
    const params = [];

    if (element) {
      params.push(element);
      query += ` AND element = $${params.length}`;
    }
    if (rarity) {
      params.push(rarity);
      query += ` AND rarity = $${params.length}`;
    }

    query += ' ORDER BY id ASC';
    const result = await pool.query(query, params);
    res.json({ cards: result.rows });
  } catch (error) {
    console.error('Error al listar cartas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.getCardById = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cards WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Carta no encontrada' });
    }
    res.json({ card: result.rows[0] });
  } catch (error) {
    console.error('Error al obtener carta:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.createCard = async (req, res) => {
  const { name, element, hp, mana_cost, attack, image_url, rarity } = req.body;

  if (!name || !element || hp === undefined || mana_cost === undefined || attack === undefined) {
    return res.status(400).json({ error: 'name, element, hp, mana_cost y attack son obligatorios' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO cards (name, element, hp, mana_cost, attack, image_url, rarity)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, element, hp, mana_cost, attack, image_url || null, rarity || 'common']
    );
    res.status(201).json({ message: 'Carta creada', card: result.rows[0] });
  } catch (error) {
    console.error('Error al crear carta:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Efectividad elemental
exports.listEffectiveness = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM element_effectiveness ORDER BY attacker, defender');
    res.json({ effectiveness: result.rows });
  } catch (error) {
    console.error('Error al listar efectividad:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.upsertEffectiveness = async (req, res) => {
  const { attacker, defender, multiplier } = req.body;

  if (!attacker || !defender || multiplier === undefined) {
    return res.status(400).json({ error: 'attacker, defender y multiplier son obligatorios' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO element_effectiveness (attacker, defender, multiplier)
       VALUES ($1, $2, $3)
       ON CONFLICT (attacker, defender)
       DO UPDATE SET multiplier = EXCLUDED.multiplier
       RETURNING *`,
      [attacker, defender, multiplier]
    );
    res.json({ effectiveness: result.rows[0] });
  } catch (error) {
    console.error('Error al guardar efectividad:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Cartas físicas (NFC)
exports.listMyPhysicalCards = async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }

  try {
    const result = await pool.query(
      `SELECT pc.*, c.name, c.element, c.hp, c.mana_cost, c.attack, c.image_url, c.rarity
       FROM physical_cards pc
       JOIN cards c ON c.id = pc.card_id
       WHERE pc.owner_id = $1
       ORDER BY pc.claimed_at DESC NULLS LAST`,
      [userId]
    );
    res.json({ physical_cards: result.rows });
  } catch (error) {
    console.error('Error al listar cartas físicas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.getPhysicalCard = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT pc.*, c.name, c.element, c.hp, c.mana_cost, c.attack, c.image_url, c.rarity
       FROM physical_cards pc
       JOIN cards c ON c.id = pc.card_id
       WHERE pc.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Carta física no encontrada' });
    }
    res.json({ physical_card: result.rows[0] });
  } catch (error) {
    console.error('Error al obtener carta física:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Registrar carta física en el sistema (pre-claim)
exports.registerPhysicalCard = async (req, res) => {
  const { nfc_uid, card_id } = req.body;

  if (!nfc_uid || !card_id) {
    return res.status(400).json({ error: 'nfc_uid y card_id son obligatorios' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO physical_cards (nfc_uid, card_id)
       VALUES ($1, $2)
       RETURNING *`,
      [nfc_uid, card_id]
    );
    res.status(201).json({ message: 'Carta física registrada', physical_card: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El nfc_uid ya está registrado' });
    }
    console.error('Error al registrar carta física:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Reclamar carta NFC
exports.claimPhysicalCard = async (req, res) => {
  const userId = getUserId(req);
  const { nfc_uid } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }
  if (!nfc_uid) {
    return res.status(400).json({ error: 'nfc_uid es obligatorio' });
  }

  try {
    const existing = await pool.query('SELECT * FROM physical_cards WHERE nfc_uid = $1', [nfc_uid]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Carta NFC no registrada en el sistema' });
    }

    const card = existing.rows[0];
    if (card.owner_id) {
      return res.status(400).json({ error: 'Esta carta ya fue reclamada' });
    }

    // Asegurar que el perfil exista
    await pool.query(
      `INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    const result = await pool.query(
      `UPDATE physical_cards
       SET owner_id = $1, claimed_at = now()
       WHERE nfc_uid = $2 AND owner_id IS NULL
       RETURNING *`,
      [userId, nfc_uid]
    );

    res.json({ message: 'Carta reclamada exitosamente', physical_card: result.rows[0] });
  } catch (error) {
    console.error('Error al reclamar carta:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Mazos
exports.listMyDecks = async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM decks WHERE user_id = $1 ORDER BY is_active DESC, name ASC',
      [userId]
    );
    res.json({ decks: result.rows });
  } catch (error) {
    console.error('Error al listar mazos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.getDeckById = async (req, res) => {
  const userId = getUserId(req);

  try {
    const deckResult = await pool.query('SELECT * FROM decks WHERE id = $1', [req.params.id]);
    if (deckResult.rows.length === 0) {
      return res.status(404).json({ error: 'Mazo no encontrado' });
    }

    const deck = deckResult.rows[0];
    if (userId && deck.user_id !== userId) {
      return res.status(403).json({ error: 'No tienes acceso a este mazo' });
    }

    const cardsResult = await pool.query(
      `SELECT dc.slot, dc.physical_card_id, pc.nfc_uid, pc.card_id,
              c.name, c.element, c.hp, c.mana_cost, c.attack, c.image_url, c.rarity
       FROM deck_cards dc
       JOIN physical_cards pc ON pc.id = dc.physical_card_id
       JOIN cards c ON c.id = pc.card_id
       WHERE dc.deck_id = $1
       ORDER BY dc.slot ASC`,
      [req.params.id]
    );

    res.json({ deck, cards: cardsResult.rows });
  } catch (error) {
    console.error('Error al obtener mazo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.createDeck = async (req, res) => {
  const userId = getUserId(req);
  const { name, is_active } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }
  if (!name) {
    return res.status(400).json({ error: 'name es obligatorio' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    if (is_active) {
      await client.query('UPDATE decks SET is_active = false WHERE user_id = $1', [userId]);
    }

    const result = await client.query(
      `INSERT INTO decks (user_id, name, is_active)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, name, Boolean(is_active)]
    );

    await client.query('COMMIT');
    res.status(201).json({ message: 'Mazo creado', deck: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al crear mazo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
};

exports.updateDeck = async (req, res) => {
  const userId = getUserId(req);
  const { name, is_active } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ownership = await client.query(
      'SELECT id FROM decks WHERE id = $1 AND user_id = $2',
      [req.params.id, userId]
    );
    if (ownership.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Mazo no encontrado' });
    }

    if (is_active) {
      await client.query('UPDATE decks SET is_active = false WHERE user_id = $1', [userId]);
    }

    const result = await client.query(
      `UPDATE decks SET
         name = COALESCE($1, name),
         is_active = COALESCE($2, is_active)
       WHERE id = $3
       RETURNING *`,
      [name, is_active, req.params.id]
    );

    await client.query('COMMIT');
    res.json({ message: 'Mazo actualizado', deck: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al actualizar mazo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
};

exports.deleteDeck = async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM decks WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mazo no encontrado' });
    }
    res.json({ message: 'Mazo eliminado' });
  } catch (error) {
    console.error('Error al eliminar mazo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.addCardToDeck = async (req, res) => {
  const userId = getUserId(req);
  const { physical_card_id, slot } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }
  if (!physical_card_id || slot === undefined) {
    return res.status(400).json({ error: 'physical_card_id y slot son obligatorios' });
  }

  try {
    const deck = await pool.query(
      'SELECT id FROM decks WHERE id = $1 AND user_id = $2',
      [req.params.id, userId]
    );
    if (deck.rows.length === 0) {
      return res.status(404).json({ error: 'Mazo no encontrado' });
    }

    const owned = await pool.query(
      'SELECT id FROM physical_cards WHERE id = $1 AND owner_id = $2',
      [physical_card_id, userId]
    );
    if (owned.rows.length === 0) {
      return res.status(400).json({ error: 'La carta física no te pertenece' });
    }

    const result = await pool.query(
      `INSERT INTO deck_cards (deck_id, physical_card_id, slot)
       VALUES ($1, $2, $3)
       ON CONFLICT (deck_id, slot)
       DO UPDATE SET physical_card_id = EXCLUDED.physical_card_id
       RETURNING *`,
      [req.params.id, physical_card_id, slot]
    );

    res.status(201).json({ message: 'Carta agregada al mazo', deck_card: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'La carta ya está en este mazo' });
    }
    console.error('Error al agregar carta al mazo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.removeCardFromDeck = async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }

  try {
    const deck = await pool.query(
      'SELECT id FROM decks WHERE id = $1 AND user_id = $2',
      [req.params.id, userId]
    );
    if (deck.rows.length === 0) {
      return res.status(404).json({ error: 'Mazo no encontrado' });
    }

    const result = await pool.query(
      `DELETE FROM deck_cards
       WHERE deck_id = $1 AND physical_card_id = $2
       RETURNING *`,
      [req.params.id, req.params.physicalCardId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Carta no encontrada en el mazo' });
    }

    res.json({ message: 'Carta removida del mazo' });
  } catch (error) {
    console.error('Error al remover carta del mazo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
