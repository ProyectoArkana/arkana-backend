const pool = require('../config/db');

// Obtener todo el catálogo de cartas
exports.getCatalog = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cards ORDER BY id ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener catálogo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Vinculación de Tarjeta NFC Física a un Usuario
exports.claimNfcCard = async (req, res) => {
  const userId = req.headers['x-user-id']; // Inyectado por el API Gateway
  const { nfc_uid, card_id } = req.body;

  if (!nfc_uid || !card_id) {
    return res.status(400).json({ error: 'nfc_uid y card_id son requeridos' });
  }

  try {
    // Registrar o actualizar el propietario de la tarjeta NFC
    const query = `
      INSERT INTO physical_cards (nfc_uid, card_id, owner_id, claimed_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (nfc_uid) 
      DO UPDATE SET owner_id = EXCLUDED.owner_id, claimed_at = NOW()
      RETURNING *;
    `;
    const result = await pool.query(query, [nfc_uid, card_id, userId]);

    res.status(201).json({
      message: 'Tarjeta NFC vinculada a tu cuenta con éxito',
      card: result.rows[0]
    });
  } catch (error) {
    console.error('Error al vincular NFC:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener las tarjetas físicas en inventario del usuario
exports.getUserInventory = async (req, res) => {
  const userId = req.headers['x-user-id'];

  try {
    const query = `
      SELECT pc.id AS physical_card_id, pc.nfc_uid, c.id AS card_id, c.name, c.element, c.hp, c.mana_cost, c.attack, c.rarity
      FROM physical_cards pc
      JOIN cards c ON pc.card_id = c.id
      WHERE pc.owner_id = $1
    `;
    const result = await pool.query(query, [userId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener inventario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};