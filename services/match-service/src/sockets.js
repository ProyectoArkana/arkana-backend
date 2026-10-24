const { verifyToken } = require('@arkana/shared');
const { EngineError } = require('./game/engine');
const { toView } = require('./game/view');

// Conecta el gestor de partidas con Socket.IO.
// Cliente -> servidor:  match:join {matchId} | picks:submit {nfcIds} | battle:action {type, toIndex?} | match:forfeit
// Servidor -> cliente:  match:state (vista personalizada) | match:error {code, message}
function registerSockets(io, getManager) {
  // Toda conexión debe traer un JWT válido; la identidad sale del token, nunca del cliente.
  io.use((socket, next) => {
    try {
      socket.data.user = verifyToken(socket.handshake.auth?.token);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  // Envía a cada jugador conectado SU vista de la partida.
  const broadcast = (match) => {
    for (const id of match.order) {
      const p = match.players[id];
      if (p.connected && p.socketId) io.to(p.socketId).emit('match:state', toView(match, id));
    }
  };

  io.on('connection', (socket) => {
    const { userId } = socket.data.user;
    const manager = getManager();

    const guard = (handler) => async (payload) => {
      try {
        await handler(payload ?? {});
      } catch (error) {
        if (error instanceof EngineError) {
          socket.emit('match:error', { code: error.code, message: error.message });
        } else {
          console.error('[match-socket]', error);
          socket.emit('match:error', { code: 'INTERNAL', message: 'Error interno del servidor' });
        }
      }
    };

    socket.on(
      'match:join',
      guard(({ matchId }) => {
        // Si el jugador se reconecta desde otro socket, el anterior queda reemplazado
        const { previousSocketId } = manager.attach(String(matchId), userId, socket.id);
        socket.data.matchId = String(matchId);
        if (previousSocketId) io.sockets.sockets.get(previousSocketId)?.disconnect(true);
      }),
    );

    const inMatch = (fn) => (payload) => {
      if (!socket.data.matchId) throw new EngineError('NOT_JOINED', 'Primero entra a la partida');
      return fn(socket.data.matchId, payload);
    };

    socket.on('picks:submit', guard(inMatch((matchId, { nfcIds }) => manager.submitPicks(matchId, userId, nfcIds))));
    socket.on('battle:action', guard(inMatch((matchId, action) => manager.act(matchId, userId, action))));
    socket.on('match:forfeit', guard(inMatch((matchId) => manager.forfeit(matchId, userId))));

    socket.on('disconnect', () => {
      if (socket.data.matchId) manager.detach(socket.data.matchId, userId, socket.id);
    });
  });

  return broadcast;
}

module.exports = { registerSockets };
