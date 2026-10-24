const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/game/engine');

const EFFECTIVENESS = E.buildEffectiveness([
  { attacker: 'AGUA', defender: 'FUEGO', multiplier: '2.00' },
  { attacker: 'FUEGO', defender: 'AGUA', multiplier: '0.50' },
]);

// Carta de prueba con valores fáciles: poder de ataque = attack + skill_power = 50
const row = (over = {}) => ({
  id: 1,
  name: 'Carta',
  element: 'TIERRA',
  hp: 100,
  mana: 5,
  attack: 30,
  defense: 10,
  speed: 50,
  skill_name: 'Golpe',
  skill_mana_cost: 2,
  skill_power: 20,
  image_url: null,
  ...over,
});

const team = (overs = []) =>
  Array.from({ length: 5 }, (_, i) => E.makeBattleCard(row({ id: i + 1, name: `C${i}`, ...(overs[i] || {}) })));

// Partida ya en combate. a = "ana", b = "beto"
function startMatch(teamA = team(), teamB = team()) {
  const m = E.createMatch({
    id: 'm1',
    effectiveness: EFFECTIVENESS,
    players: [
      { userId: 'a', username: 'ana' },
      { userId: 'b', username: 'beto' },
    ],
  });
  E.setTeam(m, 'a', teamA);
  E.setTeam(m, 'b', teamB);
  return m;
}

const act = (m, a, b, rng) => {
  E.submitAction(m, 'a', a, rng);
  return E.submitAction(m, 'b', b, rng);
};
const noTie = () => 0.1;

/* ------------------------------- Fórmula de daño ------------------------------- */

test('daño = (poder de ataque - defensa) * multiplicador, redondeado', () => {
  const att = E.makeBattleCard(row({ attack: 30, skill_power: 20 })); // poder 50
  const def = E.makeBattleCard(row({ defense: 10 }));
  assert.equal(E.calcDamage(att, def, 1), 40);
  assert.equal(E.calcDamage(att, def, 2), 80);
  assert.equal(E.calcDamage(att, def, 0.5), 20);
  assert.equal(E.calcDamage(att, E.makeBattleCard(row({ defense: 13 })), 0.5), 19); // 18.5 -> 19
});

test('el daño mínimo es 1 cuando el ataque conecta, aunque la defensa sea mayor', () => {
  const att = E.makeBattleCard(row({ attack: 5, skill_power: 5 }));
  const def = E.makeBattleCard(row({ defense: 99 }));
  assert.equal(E.calcDamage(att, def, 1), 1);
  assert.equal(E.calcDamage(att, def, 0.5), 1);
});

test('la efectividad elemental sale de la tabla; sin fila es x1', () => {
  assert.equal(E.getMultiplier(EFFECTIVENESS, 'AGUA', 'FUEGO'), 2);
  assert.equal(E.getMultiplier(EFFECTIVENESS, 'FUEGO', 'AGUA'), 0.5);
  assert.equal(E.getMultiplier(EFFECTIVENESS, 'AIRE', 'AIRE'), 1);
});

/* ------------------------------- Selección (Pick) ------------------------------- */

test('el equipo debe tener exactamente 5 cartas y la batalla empieza cuando ambos confirman', () => {
  const m = E.createMatch({
    id: 'x',
    players: [
      { userId: 'a', username: 'ana' },
      { userId: 'b', username: 'beto' },
    ],
  });
  assert.throws(() => E.setTeam(m, 'a', team().slice(0, 4)), { code: 'BAD_DECK' });
  E.setTeam(m, 'a', team());
  assert.equal(m.status, 'PICKING');
  assert.throws(() => E.setTeam(m, 'a', team()), { code: 'ALREADY_READY' });
  E.setTeam(m, 'b', team());
  assert.equal(m.status, 'IN_PROGRESS');
  assert.equal(m.phase, 'CHOOSING');
  assert.equal(m.turnNumber, 1);
});

/* ------------------------------- Ataque ------------------------------- */

test('un ataque conecta con la fórmula, aplica elemento y gasta maná', () => {
  const m = startMatch(
    team([{ element: 'AGUA' }]), // ana: agua
    team([{ element: 'FUEGO' }]), // beto: fuego
  );
  act(m, { type: 'attack' }, { type: 'attack' }, noTie);
  // ana (agua) pega x2: (50-10)*2 = 80 ; beto (fuego) pega x0.5: (50-10)*0.5 = 20
  assert.equal(m.players.b.cards[0].hp, 20);
  assert.equal(m.players.a.cards[0].hp, 80);
  assert.equal(m.players.a.cards[0].mana, 5 - 2 + E.MANA_REGEN_PER_TURN);
  assert.equal(m.turnNumber, 2);
  assert.equal(m.phase, 'CHOOSING');
});

test('sin maná suficiente no se puede atacar', () => {
  const m = startMatch(team([{ mana: 1, skill_mana_cost: 3 }]), team());
  assert.throws(() => E.submitAction(m, 'a', { type: 'attack' }), { code: 'NO_MANA' });
  assert.equal(m.players.a.choice, null); // la acción rechazada no queda registrada
});

test('el más rápido ataca primero y si deja fuera al rival, el ataque rival no ocurre', () => {
  const m = startMatch(
    team([{ speed: 90, attack: 90 }]), // ana: rápida y fuerte (poder 110 -> mata de un golpe)
    team([{ speed: 10 }]),
  );
  act(m, { type: 'attack' }, { type: 'attack' }, noTie);
  assert.equal(m.players.b.cards[0].fainted, true);
  assert.equal(m.players.a.cards[0].hp, 100, 'beto murió antes de poder atacar');
  assert.equal(m.players.a.cards[0].mana, 5 - 2 + 1);
  assert.equal(m.players.b.cards[0].mana, 5, 'el ataque cancelado no gasta maná');
});

test('en empate de velocidad decide el azar inyectado', () => {
  const run = (rng) => {
    const m = startMatch(
      team([{ speed: 50, attack: 90 }]),
      team([{ speed: 50, attack: 90 }]),
    );
    act(m, { type: 'attack' }, { type: 'attack' }, rng);
    return m;
  };
  assert.equal(run(() => 0.1).players.b.cards[0].fainted, true); // sale ana primero
  assert.equal(run(() => 0.9).players.a.cards[0].fainted, true); // sale beto primero
});

/* ------------------------------- Escudos ------------------------------- */

test('el escudo bloquea el 100% del daño sin importar el poder ni el elemento', () => {
  const m = startMatch(team([{ element: 'AGUA', attack: 500 }]), team([{ element: 'FUEGO' }]));
  act(m, { type: 'attack' }, { type: 'shield' }, noTie);
  assert.equal(m.players.b.cards[0].hp, 100);
  assert.equal(m.players.b.shields, 1);
  assert.equal(m.players.a.cards[0].mana, 5 - 2 + 1, 'el atacante igual gastó su maná');
});

test('el escudo se gasta aunque el rival no ataque', () => {
  const m = startMatch();
  act(m, { type: 'shield' }, { type: 'switch', toIndex: 1 }, noTie);
  assert.equal(m.players.a.shields, 1);
});

test('cada jugador tiene exactamente 2 escudos por partida', () => {
  const m = startMatch();
  act(m, { type: 'shield' }, { type: 'shield' }, noTie);
  act(m, { type: 'shield' }, { type: 'shield' }, noTie);
  assert.equal(m.players.a.shields, 0);
  assert.throws(() => E.submitAction(m, 'a', { type: 'shield' }), { code: 'NO_SHIELDS' });
});

/* ------------------------------- Switch ------------------------------- */

test('el switch ocurre antes que los ataques: el golpe cae en la carta que entra', () => {
  const m = startMatch(
    team(),
    team([{}, { defense: 40 }]), // la carta #1 de beto tiene defensa alta
  );
  act(m, { type: 'attack' }, { type: 'switch', toIndex: 1 }, noTie);
  assert.equal(m.players.b.activeIndex, 1);
  assert.equal(m.players.b.cards[0].hp, 100, 'la carta que salió no recibió daño');
  assert.equal(m.players.b.cards[1].hp, 100 - (50 - 40));
});

test('no se puede hacer switch a la carta activa ni a una caída', () => {
  const m = startMatch();
  assert.throws(() => E.submitAction(m, 'a', { type: 'switch', toIndex: 0 }), { code: 'BAD_TARGET' });
  assert.throws(() => E.submitAction(m, 'a', { type: 'switch', toIndex: 9 }), { code: 'BAD_TARGET' });
  m.players.a.cards[2].fainted = true;
  assert.throws(() => E.submitAction(m, 'a', { type: 'switch', toIndex: 2 }), { code: 'BAD_TARGET' });
});

/* ------------------------------- Turnos y reemplazo ------------------------------- */

test('no se puede elegir dos veces en el mismo turno', () => {
  const m = startMatch();
  E.submitAction(m, 'a', { type: 'shield' });
  assert.throws(() => E.submitAction(m, 'a', { type: 'attack' }), { code: 'ALREADY_CHOSEN' });
});

test('tras una carta caída solo ese jugador elige reemplazo y luego sigue el turno', () => {
  const m = startMatch(team([{ speed: 90, attack: 90 }]), team([{ speed: 10 }]));
  act(m, { type: 'attack' }, { type: 'shield' }, noTie); // beto se cubre
  act(m, { type: 'attack' }, { type: 'attack' }, noTie); // ana mata a beto
  assert.equal(m.phase, 'REPLACING');
  assert.deepEqual(m.pendingSwitch, ['b']);

  assert.throws(() => E.submitAction(m, 'a', { type: 'attack' }), { code: 'WAIT' });
  assert.throws(() => E.submitAction(m, 'b', { type: 'attack' }), { code: 'MUST_SWITCH' });
  assert.throws(() => E.submitAction(m, 'b', { type: 'switch', toIndex: 0 }), { code: 'BAD_TARGET' });

  const turnBefore = m.turnNumber;
  E.submitAction(m, 'b', { type: 'switch', toIndex: 3 });
  assert.equal(m.phase, 'CHOOSING');
  assert.equal(m.players.b.activeIndex, 3);
  assert.equal(m.turnNumber, turnBefore + 1);
});

/* ------------------------------- Victoria ------------------------------- */

test('gana quien deja a las 5 cartas del rival en 0 HP', () => {
  const m = startMatch(team([{ speed: 90, attack: 200 }, {}, {}, {}, {}]), team([{ speed: 10 }]));
  for (let i = 0; i < 4; i++) {
    m.players.b.cards[i + 1].fainted = true; // 4 cartas ya caídas, solo queda la activa
    m.players.b.cards[i + 1].hp = 0;
  }
  act(m, { type: 'attack' }, { type: 'shield' }, noTie);
  act(m, { type: 'attack' }, { type: 'attack' }, noTie);
  assert.equal(m.status, 'FINISHED');
  assert.equal(m.winnerId, 'a');
  assert.equal(m.endReason, 'ALL_FAINTED');
  assert.equal(m.phase, null);
  assert.throws(() => E.submitAction(m, 'a', { type: 'attack' }), { code: 'BAD_PHASE' });
});

test('abandonar da la victoria al rival; si ambos se van no hay ganador', () => {
  const m = startMatch();
  E.forfeit(m, 'a');
  assert.equal(m.status, 'FINISHED');
  assert.equal(m.winnerId, 'b');
  assert.equal(m.endReason, 'FORFEIT');

  const m2 = startMatch();
  E.abandon(m2);
  assert.equal(m2.status, 'ABANDONED');
  assert.equal(m2.winnerId, null);
});

/* ------------------------------- Sin acciones posibles (anti-bloqueo) ------------------------------- */

// Deja a un jugador con una sola carta viva, sin maná para atacar y sin escudos
function strand(player, { mana = 0 } = {}) {
  player.shields = 0;
  player.cards.forEach((c, i) => {
    if (i > 0) { c.fainted = true; c.hp = 0; }
  });
  player.cards[0].mana = mana;
  player.cards[0].skillManaCost = 3;
}

test('quien no tiene ninguna acción posible pierde el turno y recupera maná (no se bloquea el juego)', () => {
  const m = startMatch(team([{ hp: 500 }]), team());
  strand(m.players.a, { mana: 1 });

  E.submitAction(m, 'b', { type: 'attack' }, noTie); // ana no puede actuar -> descanso automático
  assert.equal(m.turnNumber, 2, 'el turno se resolvió sin esperar a ana');
  assert.ok(m.players.a.cards[0].hp < 500, 'beto igual le pegó');
  assert.equal(m.players.a.cards[0].mana, 1 + E.MANA_REGEN_PER_TURN);
  assert.ok(m.log.some((l) => /pierde el turno/.test(l.text)));

  E.submitAction(m, 'b', { type: 'attack' }, noTie); // mana 2 < 3: otro descanso
  assert.equal(m.turnNumber, 3);
  assert.equal(m.players.a.cards[0].mana, 3);

  // Ahora ana ya puede atacar: el turno espera su decisión
  E.submitAction(m, 'b', { type: 'shield' }, noTie);
  assert.equal(m.turnNumber, 3, 'ya no se salta a ana');
  assert.equal(m.players.a.choice, null);
  assert.doesNotThrow(() => E.submitAction(m, 'a', { type: 'attack' }, noTie));
  assert.equal(m.turnNumber, 4);
});

test('si ambos quedan sin acciones tras un turno, el juego avanza solo hasta que alguien pueda actuar', () => {
  // Los dos con una sola carta, maná justo para UN ataque (costo 3) y sin escudos
  const m = startMatch(team([{ hp: 500 }]), team([{ hp: 500 }]));
  strand(m.players.a, { mana: 3 });
  strand(m.players.b, { mana: 3 });

  act(m, { type: 'attack' }, { type: 'attack' }, noTie);

  // Turno 1: ambos pegaron (mana 3 -> 0, +1). Turnos 2 y 3: descansan solos (1 -> 2 -> 3).
  // Turno 4: los dos pueden atacar de nuevo y el motor espera sus decisiones.
  assert.equal(m.turnNumber, 4);
  assert.equal(m.players.a.cards[0].mana, 3);
  assert.equal(m.players.b.cards[0].mana, 3);
  assert.equal(m.players.a.choice, null);
  assert.equal(m.players.b.choice, null);
  assert.equal(m.log.filter((l) => /pierde el turno/.test(l.text)).length, 4); // 2 jugadores x 2 turnos
  assert.equal(m.status, 'IN_PROGRESS');
});
