const { getPool, normalizeNfcId, serverError } = require('@arkana/shared');
const { buildCardFilters } = require('./cardFilters');

const pool = getPool();

const CARD_COLUMNS = `c.id, c.name, c.element, c.rarity, c.hp, c.mana, c.attack, c.defense, c.speed,
                      c.skill_name, c.skill_mana_cost, c.skill_power, c.image_url`;

// Catálogo completo (el "diccionario" central de cartas).
// Filtros opcionales (ver cardFilters.js): name, element, rarity, min_attack, max_attack,
// min_defense, max_defense. Con algún filtro activo: orden por nombre y máximo 50 cartas.
exports.listCatalog = async (req, res) => {
  const { conditions, params, error } = buildCardFilters(req.query);
  if (error) return res.status(400).json({ error });

  try {
    const { rows } = conditions.length
      ? await pool.query(
          `SELECT ${CARD_COLUMNS} FROM cards c
           WHERE ${conditions.join(' AND ')}
           ORDER BY c.name LIMIT 50`,
          params,
        )
      : await pool.query(`SELECT ${CARD_COLUMNS} FROM cards c ORDER BY c.id`);
    return res.json({ cards: rows });
  } catch (error) {
    return serverError(res, 'cards.listCatalog', error);
  }
};

exports.getCardById = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

  try {
    const { rows } = await pool.query(`SELECT ${CARD_COLUMNS} FROM cards c WHERE c.id = $1`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Carta no encontrada' });
    return res.json({ card: rows[0] });
  } catch (error) {
    return serverError(res, 'cards.getCardById', error);
  }
};

exports.listEffectiveness = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT attacker, defender, multiplier::float AS multiplier FROM element_effectiveness ORDER BY attacker, defender',
    );
    return res.json({ effectiveness: rows });
  } catch (error) {
    return serverError(res, 'cards.listEffectiveness', error);
  }
};

// Escanear una carta física.
//  1) Valida que el chip exista en nfc_tags (si no, la carta es falsa).
//  2) Apunta al catálogo para devolver los atributos del personaje.
//  3) Desbloquea el registro en la galería del usuario (si ya lo tenía, no pasa nada).
// No hay dueños ni bloqueo: cualquiera puede escanear la carta que le presten.
exports.scanCard = async (req, res) => {
  const nfcId = normalizeNfcId(req.body?.nfc_id);
  if (!nfcId) return res.status(400).json({ error: 'nfc_id es obligatorio' });

  try {
    const { rows } = await pool.query(
      `SELECT ${CARD_COLUMNS}
       FROM nfc_tags t
       JOIN cards c ON c.id = t.card_id
       WHERE t.nfc_id = $1`,
      [nfcId],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Carta no reconocida: el chip no está registrado en Arkana' });
    }

    const card = rows[0];
    const unlock = await pool.query(
      `INSERT INTO user_gallery (user_id, card_id) VALUES ($1, $2)
       ON CONFLICT (user_id, card_id) DO NOTHING`,
      [req.userId, card.id],
    );

    return res.json({ card, newly_unlocked: unlock.rowCount === 1 });
  } catch (error) {
    return serverError(res, 'cards.scanCard', error);
  }
};

// Galería personal: cartas que el usuario ha escaneado alguna vez (informativa y persistente)
exports.getMyGallery = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${CARD_COLUMNS}, g.unlocked_at
       FROM user_gallery g
       JOIN cards c ON c.id = g.card_id
       WHERE g.user_id = $1
       ORDER BY g.unlocked_at DESC`,
      [req.userId],
    );
    return res.json({ cards: rows });
  } catch (error) {
    return serverError(res, 'cards.getMyGallery', error);
  }
};
