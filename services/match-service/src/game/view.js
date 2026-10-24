// Lo que cada jugador puede ver de la partida (el servidor es la única fuente de verdad).
// - Nunca se envía el nfc_id de las cartas (evita que el rival clone el chip).
// - Las cartas del rival se revelan cuando empieza la batalla.
// - La acción que eligió el rival este turno NO se envía; solo si ya eligió (`hasChosen`).
const { DECK_SIZE, SHIELDS_PER_PLAYER } = require('./engine');

const cardView = (c) => ({
  cardId: c.cardId,
  name: c.name,
  element: c.element,
  hp: c.hp,
  maxHp: c.maxHp,
  mana: c.mana,
  maxMana: c.maxMana,
  attack: c.attack,
  defense: c.defense,
  speed: c.speed,
  skillName: c.skillName,
  skillManaCost: c.skillManaCost,
  skillPower: c.skillPower,
  imageUrl: c.imageUrl,
  fainted: c.fainted,
});

const playerView = (p, showCards) => ({
  userId: p.userId,
  username: p.username,
  connected: p.connected,
  picksReady: p.picksReady,
  hasChosen: p.choice !== null,
  shields: p.shields,
  activeIndex: p.activeIndex,
  cards: showCards && p.cards ? p.cards.map(cardView) : null,
});

function toView(match, userId) {
  const me = match.players[userId];
  const opponent = match.players[match.order.find((id) => id !== userId)];
  const battleStarted = match.status !== 'PICKING';

  return {
    matchId: match.id,
    status: match.status,
    phase: match.phase,
    turnNumber: match.turnNumber,
    pendingSwitch: match.pendingSwitch,
    winnerId: match.winnerId,
    endReason: match.endReason,
    deckSize: DECK_SIZE,
    maxShields: SHIELDS_PER_PLAYER,
    me: playerView(me, true),
    opponent: playerView(opponent, battleStarted),
    log: match.log.slice(-30),
  };
}

module.exports = { toView };
