const { createClient } = require('redis');

// Conexión a Redis
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.connect().then(() => console.log('Conectado a Redis'));

exports.joinQueue = async (req, res) => {
  const userId = req.headers['x-user-id'];

  try {
    // 1. Agregar jugador al final de la cola
    await redisClient.lPush('matchmaking_queue', userId);

    // 2. Revisar cuántos jugadores hay
    const queueLength = await redisClient.lLen('matchmaking_queue');

    if (queueLength >= 2) {
      // 3. Extraer a los dos jugadores más antiguos
      const player1 = await redisClient.rPop('matchmaking_queue');
      const player2 = await redisClient.rPop('matchmaking_queue');

      console.log(`¡Emparejamiento listo! ${player1} vs ${player2}`);
      
      // Más adelante aquí se hará la llamada al match-service para crear la sala WebSocket
      return res.json({ 
        status: 'MATCH_FOUND', 
        message: 'Oponente encontrado',
        matchDetails: { player1, player2 }
      });
    }

    res.json({ status: 'WAITING', message: 'Buscando oponente...' });
  } catch (error) {
    console.error('Error en matchmaking:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

exports.leaveQueue = async (req, res) => {
  const userId = req.headers['x-user-id'];
  try {
    await redisClient.lRem('matchmaking_queue', 0, userId);
    res.json({ status: 'CANCELLED', message: 'Has salido de la cola de espera' });
  } catch (error) {
    res.status(500).json({ error: 'Error al salir de la cola' });
  }
};