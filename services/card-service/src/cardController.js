const { getPool, normalizeNfcId, serverError } = require('@arkana/shared');

const pool = getPool();

const CARD_COLUMNS = `c.id, c.name, c.element, c.hp, c.mana, c.attack, c.defense, c.speed,
                      c.skill_name, c.skill_mana_cost, c.skill_power, c.image_url`;

// Búsqueda por nombre (ARK-008): sin distinguir mayúsculas ni acentos ("pajaro" encuentra "Pájaro").
// Se normaliza igual del lado de JS y del de SQL para no depender de extensiones de PostgreSQL.
const ACCENTS = 'áéíóúüÁÉÍÓÚÜ';
const PLAIN = 'aeiouuaeiouu';
const normalizeSearch = (value) =>
  String(value ?? '')
    .trim()
    .slice(0, 50)
    .toLowerCase()
    .replace(/[áéíóúüÁÉÍÓÚÜ]/g, (ch) => PLAIN[ACCENTS.indexOf(ch)]);
const escapeLike = (value) => value.replace(/[\\%_]/g, '\\$&');
const NORMALIZED_NAME = `translate(lower(c.name), '${ACCENTS}', '${PLAIN}')`;

// Catálogo completo (el "diccionario" central de cartas).
// Con ?name=texto devuelve solo las cartas cuyo nombre contiene ese texto.
exports.listCatalog = async (req, res) => {
  const name = normalizeSearch(req.query.name);

  try {
    const { rows } = name
      ? await pool.query(
          `SELECT ${CARD_COLUMNS} FROM cards c
           WHERE ${NORMALIZED_NAME} LIKE $1
           ORDER BY c.name LIMIT 50`,
          [`%${escapeLike(name)}%`],
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
