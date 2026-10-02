const pool = require('../config/db');

exports.getProfile = async (req, res) => {
  const userId = req.headers['x-user-id']; 
  
  try {
    const result = await pool.query(
      `SELECT u.username, u.email, p.avatar_url, p.trophies, p.wins, p.losses 
       FROM users u 
       LEFT JOIN profiles p ON u.id = p.user_id 
       WHERE u.id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error en user-service:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};