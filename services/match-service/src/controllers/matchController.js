const pool = require('../config/db');

const getUserId = (req) => req.headers['x-user-id'];

const ensureProfile = async (userId) => {
  await pool.query(
    `INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
};

const isParticipant = (match, userId) =>
  match.player1_id === userId || match.player2_id === userId;

// Crear partida
exports.createMatch = async (req, res) => {
  const userId = getUserId(req);
  const { player2_id } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }

  try {
    await ensureProfile(userId);
    if (player2_id) {
      await ensureProfile(player2_id);
    }

    const result = await pool.query(
      `INSERT INTO matches (player1_id, player2_id, status)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, player2_id || null, player2_id ? 'active' : 'waiting']
    );

    res.status(201).json({ message: 'Partida creada', match: result.rows[0] });
  } catch (error) {
    console.error('Error al crear partida:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Listar partidas del usuario
exports.listMyMatches = async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }

  try {
    const { status } = req.query;
    let query = `
      SELECT * FROM matches
      WHERE player1_id = $1 OR player2_id = $1
    `;
    const params = [userId];

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ' ORDER BY started_at DESC';
    const result = await pool.query(query, params);
    res.json({ matches: result.rows });
  } catch (error) {
    console.error('Error al listar partidas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.getMatchById = async (req, res) => {
  const userId = getUserId(req);

  try {
    const result = await pool.query('SELECT * FROM matches WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Partida no encontrada' });
    }

    const match = result.rows[0];
    if (userId && !isParticipant(match, userId)) {
      return res.status(403).json({ error: 'No eres participante de esta partida' });
    }

    res.json({ match });
  } catch (error) {
    console.error('Error al obtener partida:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Unirse a partida en waiting
exports.joinMatch = async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }

  try {
    await ensureProfile(userId);

    const existing = await pool.query('SELECT * FROM matches WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Partida no encontrada' });
    }

    const match = existing.rows[0];
    if (match.status !== 'waiting') {
      return res.status(400).json({ error: 'La partida no está disponible para unirse' });
    }
    if (match.player1_id === userId) {
      return res.status(400).json({ error: 'No puedes unirte a tu propia partida' });
    }
    if (match.player2_id) {
      return res.status(400).json({ error: 'La partida ya tiene dos jugadores' });
    }

    const result = await pool.query(
      `UPDATE matches
       SET player2_id = $1, status = 'active'
       WHERE id = $2 AND status = 'waiting' AND player2_id IS NULL
       RETURNING *`,
      [userId, req.params.id]
    );

    res.json({ message: 'Te uniste a la partida', match: result.rows[0] });
  } catch (error) {
    console.error('Error al unirse a partida:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Actualizar estado / finalizar
exports.updateMatch = async (req, res) => {
  const userId = getUserId(req);
  const { status, winner_id } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }

  try {
    const existing = await pool.query('SELECT * FROM matches WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Partida no encontrada' });
    }

    const match = existing.rows[0];
    if (!isParticipant(match, userId)) {
      return res.status(403).json({ error: 'No eres participante de esta partida' });
    }

    if (winner_id && winner_id !== match.player1_id && winner_id !== match.player2_id) {
      return res.status(400).json({ error: 'winner_id debe ser un participante' });
    }

    const nextStatus = status || (winner_id ? 'finished' : match.status);
    const finishedAt = nextStatus === 'finished' || nextStatus === 'cancelled' ? new Date() : null;

    const result = await pool.query(
      `UPDATE matches SET
         status = $1,
         winner_id = COALESCE($2, winner_id),
         finished_at = COALESCE($3, finished_at)
       WHERE id = $4
       RETURNING *`,
      [nextStatus, winner_id || null, finishedAt, req.params.id]
    );

    // Actualizar stats si finaliza con ganador
    if (nextStatus === 'finished' && (winner_id || match.winner_id)) {
      const winner = winner_id || match.winner_id;
      const loser = winner === match.player1_id ? match.player2_id : match.player1_id;

      await pool.query(
        `UPDATE profiles SET wins = wins + 1, trophies = trophies + 10 WHERE user_id = $1`,
        [winner]
      );
      if (loser) {
        await pool.query(
          `UPDATE profiles SET losses = losses + 1 WHERE user_id = $1`,
          [loser]
        );
      }
    }

    res.json({ message: 'Partida actualizada', match: result.rows[0] });
  } catch (error) {
    console.error('Error al actualizar partida:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Escanear carta NFC durante partida
exports.scanCard = async (req, res) => {
  const userId = getUserId(req);
  const { physical_card_id, nfc_uid } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }
  if (!physical_card_id && !nfc_uid) {
    return res.status(400).json({ error: 'physical_card_id o nfc_uid es obligatorio' });
  }

  try {
    const matchResult = await pool.query('SELECT * FROM matches WHERE id = $1', [req.params.id]);
    if (matchResult.rows.length === 0) {
      return res.status(404).json({ error: 'Partida no encontrada' });
    }

    const match = matchResult.rows[0];
    if (!isParticipant(match, userId)) {
      return res.status(403).json({ error: 'No eres participante de esta partida' });
    }
    if (match.status !== 'active') {
      return res.status(400).json({ error: 'La partida no está activa' });
    }

    let cardQuery;
    let cardParams;
    if (physical_card_id) {
      cardQuery = 'SELECT * FROM physical_cards WHERE id = $1';
      cardParams = [physical_card_id];
    } else {
      cardQuery = 'SELECT * FROM physical_cards WHERE nfc_uid = $1';
      cardParams = [nfc_uid];
    }

    const cardResult = await pool.query(cardQuery, cardParams);
    if (cardResult.rows.length === 0) {
      return res.status(404).json({ error: 'Carta física no encontrada' });
    }

    const physicalCard = cardResult.rows[0];
    if (physicalCard.owner_id !== userId) {
      return res.status(403).json({ error: 'No eres el dueño de esta carta' });
    }

    const scanResult = await pool.query(
      `INSERT INTO match_scanned_cards (match_id, user_id, physical_card_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (match_id, physical_card_id) DO UPDATE SET scanned_at = now()
       RETURNING *`,
      [req.params.id, userId, physicalCard.id]
    );

    await pool.query(
      `INSERT INTO match_events (match_id, turn, actor_id, event_type, payload)
       VALUES ($1, 0, $2, 'card_scan', $3)`,
      [
        req.params.id,
        userId,
        JSON.stringify({ physical_card_id: physicalCard.id, nfc_uid: physicalCard.nfc_uid })
      ]
    );

    res.status(201).json({ message: 'Carta escaneada', scan: scanResult.rows[0] });
  } catch (error) {
    console.error('Error al escanear carta:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.listScannedCards = async (req, res) => {
  const userId = getUserId(req);

  try {
    const matchResult = await pool.query('SELECT * FROM matches WHERE id = $1', [req.params.id]);
    if (matchResult.rows.length === 0) {
      return res.status(404).json({ error: 'Partida no encontrada' });
    }

    if (userId && !isParticipant(matchResult.rows[0], userId)) {
      return res.status(403).json({ error: 'No eres participante de esta partida' });
    }

    const result = await pool.query(
      `SELECT msc.*, pc.nfc_uid, pc.card_id, c.name, c.element, c.hp, c.attack, c.rarity
       FROM match_scanned_cards msc
       JOIN physical_cards pc ON pc.id = msc.physical_card_id
       JOIN cards c ON c.id = pc.card_id
       WHERE msc.match_id = $1
       ORDER BY msc.scanned_at ASC`,
      [req.params.id]
    );

    res.json({ scanned_cards: result.rows });
  } catch (error) {
    console.error('Error al listar escaneos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Eventos de partida
exports.addEvent = async (req, res) => {
  const userId = getUserId(req);
  const { turn, event_type, payload } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }
  if (!event_type) {
    return res.status(400).json({ error: 'event_type es obligatorio' });
  }

  try {
    const matchResult = await pool.query('SELECT * FROM matches WHERE id = $1', [req.params.id]);
    if (matchResult.rows.length === 0) {
      return res.status(404).json({ error: 'Partida no encontrada' });
    }

    if (!isParticipant(matchResult.rows[0], userId)) {
      return res.status(403).json({ error: 'No eres participante de esta partida' });
    }

    const result = await pool.query(
      `INSERT INTO match_events (match_id, turn, actor_id, event_type, payload)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.params.id, turn || 0, userId, event_type, JSON.stringify(payload || {})]
    );

    res.status(201).json({ message: 'Evento registrado', event: result.rows[0] });
  } catch (error) {
    console.error('Error al registrar evento:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.listEvents = async (req, res) => {
  const userId = getUserId(req);

  try {
    const matchResult = await pool.query('SELECT * FROM matches WHERE id = $1', [req.params.id]);
    if (matchResult.rows.length === 0) {
      return res.status(404).json({ error: 'Partida no encontrada' });
    }

    if (userId && !isParticipant(matchResult.rows[0], userId)) {
      return res.status(403).json({ error: 'No eres participante de esta partida' });
    }

    const result = await pool.query(
      `SELECT * FROM match_events
       WHERE match_id = $1
       ORDER BY id ASC`,
      [req.params.id]
    );

    res.json({ events: result.rows });
  } catch (error) {
    console.error('Error al listar eventos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
