// Los servicios internos confían en el header x-user-id que inyecta el API Gateway
// (el gateway borra cualquier x-user-id que mande el cliente y lo reemplaza con el del JWT).
const requireUser = (req, res, next) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Usuario no autenticado' });
  req.userId = String(userId);
  next();
};

const serverError = (res, label, error) => {
  console.error(`[${label}]`, error);
  return res.status(500).json({ error: 'Error interno del servidor' });
};

module.exports = { requireUser, serverError };
