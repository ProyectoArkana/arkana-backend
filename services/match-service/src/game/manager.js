// Gestor de partidas en memoria: ciclo de vida, desconexiones y guardado del resultado.
// Las dependencias de I/O se inyectan (repo, onChange) para poder probarlo sin BD ni sockets.
const { randomUUID } = require('node:crypto');
const engine = require('./engine');
const { normalizeNfcId } = require('@arkana/shared');

class ConflictError extends Error {
  constructor(userId) {
    super('El jugador ya tiene una partida en curso');
    this.code = 'ALREADY_IN_MATCH';
    this.userId = userId;
  }
}

const CLEANUP_AFTER_MS = 5 * 60 * 1000;

function createMatchManager({ repo, onChange = () => {}, graceMs = 30000, rng = Math.random }) {
  const matches = new Map(); // matchId -> match
  const activeByUser = new Map(); // userId -> matchId (partida sin terminar)
  const graceTimers = new Map(); // `${matchId}:${userId}` -> timeout

  const timerKey = (matchId, userId) => `${matchId}:${userId}`;

  const clearGrace = (matchId, userId) => {
    const key = timerKey(matchId, userId);
    clearTimeout(graceTimers.get(key));
    graceTimers.delete(key);
  };

  function startGrace(match, userId) {
    clearGrace(match.id, userId);
    const timer = setTimeout(() => {
      graceTimers.delete(timerKey(match.id, userId));
      onGraceExpired(match, userId);
    }, graceMs);
    timer.unref?.();
    graceTimers.set(timerKey(match.id, userId), timer);
  }

  function onGraceExpired(match, userId) {
    if (engine.isOver(match)) return;
    if (match.players[userId].connected) return;

    if (engine.opponentOf(match, userId).connected) {
      engine.forfeit(match, userId, 'OPPONENT_DISCONNECTED');
    } else {
      engine.abandon(match);
    }
    finalize(match);
  }

  // Cierre común: libera a los jugadores, guarda el resultado final y avisa.
  function finalize(match) {
    for (const id of match.order) {
      clearGrace(match.id, id);
      if (activeByUser.get(id) === match.id) activeByUser.delete(id);
    }

    if (match.status === 'FINISHED' && match.winnerId) {
      repo.saveResult(match).catch((e) => console.error('[match] no se pudo guardar el resultado:', e.message));
    }

    const cleanup = setTimeout(() => matches.delete(match.id), CLEANUP_AFTER_MS);
    cleanup.unref?.();
    onChange(match);
  }

  // Si el turno terminó la partida (todas las cartas caídas), se cierra aquí.
  const afterChange = (match) => (engine.isOver(match) ? finalize(match) : onChange(match));

  return {
    get: (matchId) => matches.get(matchId),

    async createMatch(players) {
      for (const p of players) {
        const existingId = activeByUser.get(p.userId);
        const existing = existingId && matches.get(existingId);
        if (existing && !engine.isOver(existing)) throw new ConflictError(p.userId);
      }

      const effectiveness = engine.buildEffectiveness(await repo.loadEffectiveness());
      const match = engine.createMatch({ id: randomUUID(), players, effectiveness });

      matches.set(match.id, match);
      for (const p of players) {
        activeByUser.set(p.userId, match.id);
        startGrace(match, p.userId); // si nunca entra a la sala, pierde / se abandona
      }
      return match;
    },

    // Un jugador (re)entra a la sala. Devuelve el socketId anterior, si había uno distinto.
    attach(matchId, userId, socketId) {
      const match = matches.get(matchId);
      if (!match || !match.players[userId]) throw new engine.EngineError('NOT_FOUND', 'La partida no existe o no participas en ella');

      const player = match.players[userId];
      const previousSocketId = player.socketId && player.socketId !== socketId ? player.socketId : null;
      player.socketId = socketId;
      player.connected = true;
      clearGrace(matchId, userId);
      onChange(match);
      return { match, previousSocketId };
    },

    // Un socket se cayó. Solo cuenta si era el socket vigente del jugador.
    detach(matchId, userId, socketId) {
      const match = matches.get(matchId);
      const player = match?.players[userId];
      if (!player || player.socketId !== socketId || engine.isOver(match)) return;

      player.connected = false;
      player.socketId = null;
      startGrace(match, userId);
      onChange(match);
    },

    // Confirma el equipo: cada chip se valida contra nfc_tags (carta falsa = error).
    async submitPicks(matchId, userId, nfcIds) {
      const match = matches.get(matchId);
      if (!match) throw new engine.EngineError('NOT_FOUND', 'La partida no existe');

      const ids = Array.isArray(nfcIds) ? nfcIds.map(normalizeNfcId) : [];
      if (ids.length !== engine.DECK_SIZE || ids.some((id) => !id)) {
        throw new engine.EngineError('BAD_DECK', `Debes escanear exactamente ${engine.DECK_SIZE} cartas`);
      }
      if (new Set(ids).size !== ids.length) {
        throw new engine.EngineError('DUPLICATE_CARD', 'No puedes usar la misma carta física dos veces');
      }

      const found = await repo.findCardsByNfcIds(ids);
      const missing = ids.find((id) => !found[id]);
      if (missing) {
        throw new engine.EngineError('UNKNOWN_CARD', `El chip ${missing} no pertenece a una carta de Arkana`);
      }

      // El equipo vive solo en memoria mientras dura la partida
      engine.setTeam(match, userId, ids.map((id) => engine.makeBattleCard(found[id])));

      repo
        .unlockCards(userId, [...new Set(ids.map((id) => found[id].id))])
        .catch((e) => console.error('[match] no se pudo actualizar la galería:', e.message));

      afterChange(match);
    },

    act(matchId, userId, action) {
      const match = matches.get(matchId);
      if (!match) throw new engine.EngineError('NOT_FOUND', 'La partida no existe');
      engine.submitAction(match, userId, action, rng);
      afterChange(match);
    },

    forfeit(matchId, userId) {
      const match = matches.get(matchId);
      if (!match) throw new engine.EngineError('NOT_FOUND', 'La partida no existe');
      engine.forfeit(match, userId, 'FORFEIT');
      afterChange(match);
    },
  };
}

module.exports = { createMatchManager, ConflictError };
