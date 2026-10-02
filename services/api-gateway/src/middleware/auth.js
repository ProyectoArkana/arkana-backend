const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'secreto_super_seguro';

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; 

  if (!token) {
    console.log('❌ Gateway: No llegó token en el header');
    return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.headers['x-user-id'] = verified.id; 
    req.headers['x-user-email'] = verified.email;
    console.log('✅ Gateway: Token verificado con éxito para el usuario ID:', verified.id);
    next();
  } catch (error) {
    // ESTE ES EL QUE DA EL 403. Imprimimos el error exacto de por qué falló:
    console.log('❌ Gateway: Error al verificar JWT ->', error.message);
    return res.status(403).json({ error: 'Token inválido o expirado.' });
  }
};

module.exports = { verifyToken };