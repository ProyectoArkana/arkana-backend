// Cola de emparejamiento en memoria (MVP: una sola instancia del servicio).
// Lógica separada de Socket.IO para poder probarla: recibe `createMatch` y `notify` inyectados.
//
// entry = { userId, username, socketId }
function createQueue({ createMatch, notify }) {
  const waiting = []; // FIFO: el que lleva más tiempo esperando va primero
  let pairing = false;

  const indexOf = (userId) => waiting.findIndex((e) => e.userId === userId);

  const join = (entry) => {
    // Una cuenta solo puede estar una vez en la cola: la conexión nueva reemplaza a la vieja
    const existing = indexOf(entry.userId);
    if (existing !== -1) waiting.splice(existing, 1);
    waiting.push(entry);

    notify(entry, 'queue_joined', { playersInQueue: waiting.length });
    tryPair();
  };

  const leave = (userId, socketId) => {
    const i = indexOf(userId);
    // Solo sale si el socket que se va es el vigente (evita que la conexión vieja saque a la nueva)
    if (i !== -1 && (!socketId || waiting[i].socketId === socketId)) waiting.splice(i, 1);
  };

  async function tryPair() {
    if (pairing) return;
    pairing = true;
    try {
      while (waiting.length >= 2) {
        const a = waiting.shift();
        const b = waiting.shift();

        try {
          const matchId = await createMatch([a, b]);
          notify(a, 'match_found', { matchId, opponent: { userId: b.userId, username: b.username } });
          notify(b, 'match_found', { matchId, opponent: { userId: a.userId, username: a.username } });
        } catch (error) {
          if (error.status === 409 && error.conflictUserId) {
            // Uno de los dos ya está en una partida en curso: se le avisa y el otro vuelve a la cola
            const blocked = error.conflictUserId === a.userId ? a : b;
            const free = blocked === a ? b : a;
            notify(blocked, 'queue_error', { message: 'Ya tienes una partida en curso.' });
            waiting.unshift(free);
          } else {
            console.error('[matchmaking] no se pudo crear la partida:', error.message);
            notify(a, 'queue_error', { message: 'No se pudo crear la partida. Inténtalo de nuevo.' });
            notify(b, 'queue_error', { message: 'No se pudo crear la partida. Inténtalo de nuevo.' });
          }
        }
      }
    } finally {
      pairing = false;
    }
  }

  return { join, leave, size: () => waiting.length };
}

module.exports = { createQueue };
