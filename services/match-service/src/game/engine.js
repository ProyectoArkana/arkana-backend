// Motor de combate 1 vs 1 de Arkana. Módulo PURO: sin sockets, sin BD, sin timers.
// Todo el estado vive en un objeto `match` en memoria (el equipo es efímero, no se guarda).
//
// Reglas (documento del proyecto):
//  * Cada jugador escanea 5 cartas (fase PICK). Una sola carta activa al frente.
//  * En cada turno el jugador elige: ATACAR, hacer SWITCH con una carta de su banca o activar un ESCUDO.
//  * Escudos: exactamente 2 por jugador y partida. Un escudo bloquea el 100% del daño entrante
//    de ese turno, sin importar el poder del ataque ni el elemento.
//  * Daño final = (Poder de Ataque - Defensa del defensor) * Multiplicador elemental,
//    redondeado y con mínimo 1 si el ataque conecta.
//  * Gana quien reduce a 0 HP las 5 cartas del rival.
//
// Cómo se resuelve un turno (estilo Pokémon): los dos jugadores eligen en secreto y el servidor
// resuelve en este orden: 1) switches, 2) escudos, 3) ataques por velocidad (más rápido primero;
// si el primero deja fuera de combate al rival, el ataque del rival ya no ocurre).

const DECK_SIZE = 5;
const SHIELDS_PER_PLAYER = 2;
// Maná que recupera la carta activa al final de cada turno. (El documento define maná y costo de
// habilidad pero no la regeneración; es un solo número, ajústalo aquí.)
const MANA_REGEN_PER_TURN = 1;
const MIN_DAMAGE = 1;
const LOG_LIMIT = 60;

class EngineError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/* ------------------------------ Cartas y daño ------------------------------ */

// Convierte una fila del catálogo (tabla cards) en una carta de batalla.
function makeBattleCard(row) {
  return {
    cardId: row.id,
    name: row.name,
    element: row.element,
    hp: row.hp,
    maxHp: row.hp,
    mana: row.mana,
    maxMana: row.mana,
    attack: row.attack,
    defense: row.defense,
    speed: row.speed,
    skillName: row.skill_name,
    skillManaCost: row.skill_mana_cost,
    skillPower: row.skill_power,
    imageUrl: row.image_url ?? null,
    fainted: false,
  };
}

// "Poder de Ataque" = ataque base de la carta + poder de daño de su habilidad.
const attackPower = (card) => card.attack + card.skillPower;

function getMultiplier(effectiveness, attackerElement, defenderElement) {
  return effectiveness[`${attackerElement}:${defenderElement}`] ?? 1;
}

// Daño Final = (Poder de Ataque - Defensa) * Multiplicador, redondeado, mínimo 1.
function calcDamage(attacker, defender, multiplier = 1) {
  const raw = (attackPower(attacker) - defender.defense) * multiplier;
  return Math.max(MIN_DAMAGE, Math.round(raw));
}

// rows de element_effectiveness -> { 'AGUA:FUEGO': 2, ... }
function buildEffectiveness(rows) {
  const map = {};
  for (const r of rows) map[`${r.attacker}:${r.defender}`] = Number(r.multiplier);
  return map;
}

/* ------------------------------ Estado de partida ------------------------------ */

function createMatch({ id, players, effectiveness = {} }) {
  if (!Array.isArray(players) || players.length !== 2 || players[0].userId === players[1].userId) {
    throw new EngineError('BAD_PLAYERS', 'Una partida necesita dos jugadores distintos');
  }

  const match = {
    id,
    status: 'PICKING', // PICKING | IN_PROGRESS | FINISHED | ABANDONED
    phase: null, // CHOOSING | REPLACING (solo mientras status = IN_PROGRESS)
    turnNumber: 0,
    pendingSwitch: [], // jugadores que deben reemplazar su carta caída
    winnerId: null,
    endReason: null, // ALL_FAINTED | FORFEIT | OPPONENT_DISCONNECTED | ABANDONED
    effectiveness,
    order: players.map((p) => p.userId),
    players: {},
    log: [],
    logSeq: 0,
  };

  for (const p of players) {
    match.players[p.userId] = {
      userId: p.userId,
      username: p.username,
      connected: false,
      socketId: null,
      picksReady: false,
      cards: null,
      activeIndex: 0,
      shields: SHIELDS_PER_PLAYER,
      choice: null,
    };
  }
  return match;
}

const opponentOf = (match, userId) => match.players[match.order.find((id) => id !== userId)];
const activeCard = (player) => player.cards[player.activeIndex];
const isOver = (match) => match.status === 'FINISHED' || match.status === 'ABANDONED';

function pushLog(match, text) {
  match.log.push({ id: ++match.logSeq, turn: match.turnNumber, text });
  if (match.log.length > LOG_LIMIT) match.log.splice(0, match.log.length - LOG_LIMIT);
}

function getPlayer(match, userId) {
  const player = match.players[userId];
  if (!player) throw new EngineError('NOT_IN_MATCH', 'No participas en esta partida');
  return player;
}

/* ------------------------------ Fase PICK ------------------------------ */

// Registra el equipo (efímero) de un jugador. Cuando ambos están listos empieza la batalla.
function setTeam(match, userId, cards) {
  const player = getPlayer(match, userId);
  if (match.status !== 'PICKING') throw new EngineError('BAD_PHASE', 'La selección de cartas ya terminó');
  if (player.picksReady) throw new EngineError('ALREADY_READY', 'Ya confirmaste tu equipo');
  if (!Array.isArray(cards) || cards.length !== DECK_SIZE) {
    throw new EngineError('BAD_DECK', `Debes elegir exactamente ${DECK_SIZE} cartas`);
  }

  player.cards = cards;
  player.activeIndex = 0;
  player.picksReady = true;

  if (match.order.every((id) => match.players[id].picksReady)) {
    match.status = 'IN_PROGRESS';
    match.phase = 'CHOOSING';
    match.turnNumber = 1;
    pushLog(match, '¡Comienza la batalla!');
    settleChoosing(match, Math.random);
  }
}

/* ------------------------------ Turnos ------------------------------ */

function assertSwitchTarget(player, toIndex) {
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= player.cards.length) {
    throw new EngineError('BAD_TARGET', 'Carta inválida');
  }
  if (toIndex === player.activeIndex && !activeCard(player).fainted) {
    throw new EngineError('BAD_TARGET', 'Esa carta ya está en combate');
  }
  if (player.cards[toIndex].fainted) {
    throw new EngineError('BAD_TARGET', 'Esa carta está fuera de combate');
  }
}

// Un jugador envía su decisión. Devuelve true si con esto se resolvió el turno.
function submitAction(match, userId, action, rng = Math.random) {
  const player = getPlayer(match, userId);
  if (match.status !== 'IN_PROGRESS') throw new EngineError('BAD_PHASE', 'La batalla no está en curso');

  const type = action?.type;

  // Reemplazo obligatorio tras una carta caída: solo switch y solo quien lo necesita
  if (match.phase === 'REPLACING') {
    if (!match.pendingSwitch.includes(userId)) {
      throw new EngineError('WAIT', 'Espera a que tu rival elija su reemplazo');
    }
    if (type !== 'switch') throw new EngineError('MUST_SWITCH', 'Tu carta cayó: elige otra de tu banca');
    assertSwitchTarget(player, action.toIndex);

    player.activeIndex = action.toIndex;
    pushLog(match, `${player.username} envía a ${activeCard(player).name}.`);

    match.pendingSwitch = match.pendingSwitch.filter((id) => id !== userId);
    if (match.pendingSwitch.length === 0) {
      match.phase = 'CHOOSING';
      match.turnNumber += 1;
      settleChoosing(match, rng);
    }
    return false;
  }

  // Fase normal: los dos eligen y se resuelve cuando ambos eligieron
  if (player.choice) throw new EngineError('ALREADY_CHOSEN', 'Ya elegiste tu acción de este turno');

  if (type === 'attack') {
    const card = activeCard(player);
    if (card.mana < card.skillManaCost) {
      throw new EngineError('NO_MANA', `Maná insuficiente para ${card.skillName} (${card.mana}/${card.skillManaCost})`);
    }
    player.choice = { type: 'attack' };
  } else if (type === 'shield') {
    if (player.shields <= 0) throw new EngineError('NO_SHIELDS', 'Ya no te quedan escudos');
    player.choice = { type: 'shield' };
  } else if (type === 'switch') {
    assertSwitchTarget(player, action.toIndex);
    player.choice = { type: 'switch', toIndex: action.toIndex };
  } else {
    throw new EngineError('BAD_ACTION', 'Acción desconocida');
  }

  // Resuelve el turno si ya eligieron los dos (y encadena turnos si alguien no puede actuar)
  const before = match.turnNumber;
  settleChoosing(match, rng);
  return match.turnNumber !== before || isOver(match);
}

// ¿Tiene el jugador al menos una acción posible? (atacar con maná, escudo o switch a la banca)
function hasLegalAction(player) {
  const card = activeCard(player);
  if (card.mana >= card.skillManaCost) return true;
  if (player.shields > 0) return true;
  return player.cards.some((c, i) => !c.fainted && i !== player.activeIndex);
}

// Se llama cada vez que corresponde elegir acción. Evita el bloqueo del juego: quien no tiene
// ninguna acción posible (sin maná para atacar, sin escudos y sin banca) pierde el turno y su
// carta recupera maná. Cuando ambos ya eligieron, resuelve el turno (y repite si hace falta).
function settleChoosing(match, rng) {
  while (match.status === 'IN_PROGRESS' && match.phase === 'CHOOSING') {
    for (const id of match.order) {
      const p = match.players[id];
      if (!p.choice && !hasLegalAction(p)) {
        p.choice = { type: 'rest' };
        pushLog(match, `${p.username} no tiene acciones disponibles y pierde el turno.`);
      }
    }
    if (!match.order.every((id) => match.players[id].choice)) return;
    resolveTurn(match, rng);
  }
}

function finish(match, winnerId, reason) {
  match.status = 'FINISHED';
  match.phase = null;
  match.pendingSwitch = [];
  match.winnerId = winnerId;
  match.endReason = reason;
}

function resolveTurn(match, rng) {
  const players = match.order.map((id) => match.players[id]);

  // 1) Switches
  for (const p of players) {
    if (p.choice.type !== 'switch') continue;
    p.activeIndex = p.choice.toIndex;
    pushLog(match, `${p.username} cambia a ${activeCard(p).name}.`);
  }

  // 2) Escudos (se gastan al activarse, bloqueen algo o no)
  const shielded = new Set();
  for (const p of players) {
    if (p.choice.type !== 'shield') continue;
    p.shields -= 1;
    shielded.add(p.userId);
    pushLog(match, `${p.username} activa un escudo (le quedan ${p.shields}).`);
  }

  // 3) Ataques, el más rápido primero (empate de velocidad: al azar)
  let attackers = players.filter((p) => p.choice.type === 'attack');
  if (attackers.length === 2) {
    const [x, y] = attackers;
    const speedX = activeCard(x).speed;
    const speedY = activeCard(y).speed;
    if (speedY > speedX || (speedY === speedX && rng() >= 0.5)) attackers = [y, x];
  }

  for (const attacker of attackers) {
    if (isOver(match)) break;
    const attCard = activeCard(attacker);
    if (attCard.fainted) continue; // lo dejaron fuera antes de poder atacar

    const defender = opponentOf(match, attacker.userId);
    const defCard = activeCard(defender);

    attCard.mana -= attCard.skillManaCost;

    if (shielded.has(defender.userId)) {
      pushLog(match, `${attCard.name} usa ${attCard.skillName}, pero el escudo de ${defender.username} bloquea el golpe.`);
      continue;
    }

    const multiplier = getMultiplier(match.effectiveness, attCard.element, defCard.element);
    const damage = calcDamage(attCard, defCard, multiplier);
    defCard.hp = Math.max(0, defCard.hp - damage);

    const note = multiplier > 1 ? ' ¡Es muy efectivo!' : multiplier < 1 ? ' No es muy efectivo...' : '';
    pushLog(match, `${attCard.name} usa ${attCard.skillName} y hace ${damage} de daño a ${defCard.name}.${note}`);

    if (defCard.hp === 0) {
      defCard.fainted = true;
      pushLog(match, `${defCard.name} de ${defender.username} queda fuera de combate.`);
      if (defender.cards.every((c) => c.fainted)) {
        finish(match, attacker.userId, 'ALL_FAINTED');
        pushLog(match, `¡${attacker.username} gana la partida!`);
      }
    }
  }

  for (const p of players) p.choice = null;
  if (isOver(match)) return;

  // 4) Recuperación de maná de la carta activa
  for (const p of players) {
    const card = activeCard(p);
    if (!card.fainted) card.mana = Math.min(card.maxMana, card.mana + MANA_REGEN_PER_TURN);
  }

  // 5) ¿Alguien necesita reemplazar su carta caída?
  const mustReplace = players.filter((p) => activeCard(p).fainted).map((p) => p.userId);
  if (mustReplace.length > 0) {
    match.phase = 'REPLACING';
    match.pendingSwitch = mustReplace;
  } else {
    match.phase = 'CHOOSING';
    match.turnNumber += 1;
  }
}

/* ------------------------------ Cierres anticipados ------------------------------ */

// Abandono voluntario o pérdida por desconexión: gana el rival.
function forfeit(match, loserId, reason = 'FORFEIT') {
  if (isOver(match)) return;
  const loser = getPlayer(match, loserId);
  const winner = opponentOf(match, loserId);
  finish(match, winner.userId, reason);
  pushLog(match, reason === 'FORFEIT' ? `${loser.username} abandona la partida.` : `${loser.username} se desconectó.`);
}

// Ambos se fueron: no hay ganador y no se guarda nada.
function abandon(match) {
  if (isOver(match)) return;
  match.status = 'ABANDONED';
  match.phase = null;
  match.pendingSwitch = [];
  match.endReason = 'ABANDONED';
}

module.exports = {
  DECK_SIZE,
  SHIELDS_PER_PLAYER,
  MANA_REGEN_PER_TURN,
  EngineError,
  makeBattleCard,
  buildEffectiveness,
  getMultiplier,
  attackPower,
  calcDamage,
  createMatch,
  setTeam,
  submitAction,
  forfeit,
  abandon,
  opponentOf,
  activeCard,
  isOver,
};
