const {
  ARENA,
  RULES,
  PLAYERS,
  scenarioWith,
  createEngine,
  run,
  startMatch,
  placePlayer,
} = require('./helpers/obstacleScenario');
const { ArenaEngine } = require('../src/modules/realtime/arenaEngine');
const { EventFactory } = require('../src/modules/events/eventFactory');
const { SpecialEvent } = require('../src/modules/events/specialEvent');
const { REACTOR, GAMEPLAY } = require('../src/modules/game/game.config');

// US-18: extracción de energía del reactor. En el escenario de prueba el reactor ocupa las
// columnas 14 a 17 y las filas 8 a 11; los jugadores ven desde las celdas (13, 9) y (18, 9).

const NEAR_A = [13, 9];
const NEAR_B = [18, 9];
const FAR = [2, 2];

function started(options = {}) {
  const engine = createEngine({ scenario: scenarioWith(), ...options });
  startMatch(engine);

  return engine;
}

const view = (engine, id) => engine.snapshot().players.find((p) => p.id === id);

describe('Extracción de energía: caso válido (CA-18.2, CA-18.4, CA-18.6, CA-18.9)', () => {
  it('el reactor empieza disponible y visible en el estado de la arena (CA-18.1)', () => {
    const engine = started();

    expect(engine.snapshot().reactor).toMatchObject({ state: 'available', extractions: 0 });
    expect(engine.snapshot().reactor.range).toBe(REACTOR.range);
  });

  it('dentro de la zona suma los puntos al jugador que pulsó y deja el reactor recargando', () => {
    const engine = started();
    placePlayer(engine, 'a', ...NEAR_A);

    const result = engine.extractEnergy('a', 'p1');

    expect(result).toEqual({ ok: true, points: REACTOR.extractPoints });
    expect(view(engine, 'a').score).toBe(REACTOR.extractPoints);
    expect(view(engine, 'b').score).toBe(0);
    expect(engine.snapshot().reactor).toMatchObject({
      state: 'recharging',
      extractions: 1,
      lastBy: 'a',
    });
  });

  it('el reactor vuelve a estar disponible al terminar la recarga', () => {
    const engine = started();
    placePlayer(engine, 'a', ...NEAR_A);
    engine.extractEnergy('a', 'p1');

    run(engine, REACTOR.cooldownSeconds + 0.2);

    expect(engine.snapshot().reactor.state).toBe('available');
  });

  it('el puntaje es el mismo que ven todos los clientes: sale del snapshot del servidor', () => {
    const engine = started();
    placePlayer(engine, 'b', ...NEAR_B);
    engine.extractEnergy('b', 'p1');

    expect(engine.snapshot().players.map((p) => p.score)).toEqual([0, REACTOR.extractPoints]);
  });
});

describe('Extracción de energía: rechazos (CA-18.3, CA-18.5)', () => {
  it('fuera de la zona de interacción no suma y explica el motivo', () => {
    const engine = started();
    placePlayer(engine, 'a', ...FAR);

    const result = engine.extractEnergy('a', 'p1');

    expect(result).toMatchObject({ ok: false, code: 'OUT_OF_RANGE' });
    expect(result.message).toMatch(/reactor/i);
    expect(view(engine, 'a').score).toBe(0);
    expect(engine.snapshot().reactor.extractions).toBe(0);
  });

  it('la zona llega hasta `range` del borde del reactor y no más', () => {
    const engine = started();
    const player = placePlayer(engine, 'a', ...NEAR_A);
    const rect = engine.scenario.reactor;

    player.x = rect.x - REACTOR.range + 1;
    expect(engine.extractEnergy('a', 'dentro').ok).toBe(true);

    run(engine, REACTOR.cooldownSeconds + 0.2);
    player.x = rect.x - REACTOR.range - 1;
    expect(engine.extractEnergy('a', 'fuera')).toMatchObject({ ok: false, code: 'OUT_OF_RANGE' });
  });

  it('durante la cuenta regresiva la partida no está activa', () => {
    const engine = createEngine({ scenario: scenarioWith() });
    placePlayer(engine, 'a', ...NEAR_A);

    expect(engine.extractEnergy('a', 'p1')).toMatchObject({ ok: false, code: 'NOT_RUNNING' });
    expect(view(engine, 'a').score).toBe(0);
  });

  it('terminada la partida ya no se puede extraer (CA-25.3)', () => {
    const engine = started();
    placePlayer(engine, 'a', ...NEAR_A);
    engine.finish();

    expect(engine.extractEnergy('a', 'p1')).toMatchObject({ ok: false, code: 'NOT_RUNNING' });
    expect(view(engine, 'a').score).toBe(0);
  });

  it('un jugador congelado no puede extraer', () => {
    const engine = started();
    const ana = placePlayer(engine, 'a', ...NEAR_A);
    engine.freezePlayer(ana, 3);

    expect(engine.extractEnergy('a', 'p1')).toMatchObject({ ok: false, code: 'FROZEN' });
    expect(view(engine, 'a').score).toBe(0);
  });

  it('quien no juega la partida no puede extraer (la identidad la pone el servidor)', () => {
    const engine = started();

    expect(engine.extractEnergy('intruso', 'p1')).toMatchObject({ code: 'NOT_IN_MATCH' });
    expect(engine.players.map((p) => p.score)).toEqual([0, 0]);
  });

  it('un escenario sin reactor (partida sin mapa) rechaza la acción', () => {
    const engine = createEngine();
    startMatch(engine);

    expect(engine.snapshot().reactor).toBeNull();
    expect(engine.extractEnergy('a', 'p1')).toMatchObject({ ok: false, code: 'NO_REACTOR' });
  });
});

describe('Extracción de energía: competencia (CA-18.7, CA-19.6)', () => {
  it('el primero en pulsar se lleva la energía; el otro espera a la recarga', () => {
    const engine = started();
    placePlayer(engine, 'a', ...NEAR_A);
    placePlayer(engine, 'b', ...NEAR_B);

    expect(engine.extractEnergy('a', 'a1').ok).toBe(true);
    expect(engine.extractEnergy('b', 'b1')).toMatchObject({ ok: false, code: 'RECHARGING' });

    run(engine, REACTOR.cooldownSeconds + 0.2);
    expect(engine.extractEnergy('b', 'b2').ok).toBe(true);
    expect(engine.snapshot().players.map((p) => p.score)).toEqual([
      REACTOR.extractPoints,
      REACTOR.extractPoints,
    ]);
    expect(engine.snapshot().reactor.lastBy).toBe('b');
  });

  it('mantener pulsado no sirve: el mismo jugador tampoco puede volver a extraer en la recarga', () => {
    const engine = started();
    placePlayer(engine, 'a', ...NEAR_A);

    engine.extractEnergy('a', 'p1');
    expect(engine.extractEnergy('a', 'p2')).toMatchObject({ code: 'RECHARGING' });
    expect(view(engine, 'a').score).toBe(REACTOR.extractPoints);
  });
});

describe('Extracción de energía: sin duplicados (CA-18.8, CA-19.4)', () => {
  it('el mismo identificador de acción no se cuenta dos veces, ni pasada la recarga', () => {
    const engine = started();
    placePlayer(engine, 'a', ...NEAR_A);

    expect(engine.extractEnergy('a', 'misma').ok).toBe(true);
    expect(engine.extractEnergy('a', 'misma')).toMatchObject({ ok: false, code: 'DUPLICATE' });

    run(engine, REACTOR.cooldownSeconds + 0.2);
    expect(engine.extractEnergy('a', 'misma')).toMatchObject({ ok: false, code: 'DUPLICATE' });
    expect(view(engine, 'a').score).toBe(REACTOR.extractPoints);

    expect(engine.extractEnergy('a', 'otra').ok).toBe(true);
    expect(view(engine, 'a').score).toBe(REACTOR.extractPoints * 2);
  });

  it('el identificador solo vale para quien lo envió', () => {
    const engine = started();
    placePlayer(engine, 'a', ...NEAR_A);
    placePlayer(engine, 'b', ...NEAR_B);

    engine.extractEnergy('a', 'x');
    run(engine, REACTOR.cooldownSeconds + 0.2);

    expect(engine.extractEnergy('b', 'x').ok).toBe(true);
  });

  it('moverse, aunque sea junto al reactor, nunca da puntos', () => {
    const engine = started({ rules: { itemsOnField: 0 } });
    placePlayer(engine, 'a', ...NEAR_A);
    engine.setInput('a', 0, 1);

    run(engine, 5);

    expect(view(engine, 'a').score).toBe(0);
    expect(engine.items).toHaveLength(0);
  });

  it('por defecto el mapa no tiene celdas permanentes: la energía sale del reactor', () => {
    expect(GAMEPLAY.itemsOnField).toBe(0);

    const engine = new ArenaEngine({
      config: { endMode: 'TIME', durationSeconds: 100, targetPoints: null },
      arena: ARENA,
      rules: { ...GAMEPLAY, countdownSeconds: 1 },
      players: PLAYERS,
      scenario: scenarioWith(),
    });
    startMatch(engine);

    expect(engine.snapshot().items).toEqual([]);
  });
});

describe('Extracción de energía y reglas de puntuación (CA-19.1, CA-19.5)', () => {
  const triple = class extends SpecialEvent {
    modify(modifiers) {
      modifiers.pointMultiplier *= 3;
    }
  };
  triple.type = 'triple';
  triple.label = 'Triple';

  const off = class extends SpecialEvent {
    modify(modifiers) {
      modifiers.reactorDisabled = true;
    }
  };
  off.type = 'reactor-off';
  off.label = 'Reactor apagado';

  function withEvent(type) {
    const engine = started({
      eventFactory: new EventFactory().register(type),
      rules: { eventIntervalSeconds: 1, eventDurationSeconds: 20 },
    });
    while (!engine.events.active && engine.elapsed < 30) engine.step(0.1);
    placePlayer(engine, 'a', ...NEAR_A);

    return engine;
  }

  it('un evento que multiplica los puntos también multiplica la extracción', () => {
    const engine = withEvent(triple);

    expect(engine.extractEnergy('a', 'p1')).toEqual({ ok: true, points: REACTOR.extractPoints * 3 });
  });

  it('el sector de riesgo multiplica los puntos de quien extrae', () => {
    const engine = started();
    const ana = placePlayer(engine, 'a', ...NEAR_A);
    ana.risk = 2;

    expect(engine.extractEnergy('a', 'p1').points).toBe(REACTOR.extractPoints * 2);
  });

  it('un evento que apaga el reactor impide extraer y no cambia el puntaje', () => {
    const engine = withEvent(off);

    expect(engine.snapshot().reactor.state).toBe('disabled');
    expect(engine.extractEnergy('a', 'p1')).toMatchObject({ ok: false, code: 'DISABLED' });
    expect(view(engine, 'a').score).toBe(0);
  });

  it('durante la prórroga por empate también se puede extraer, y desempata', () => {
    const engine = started();
    placePlayer(engine, 'a', ...NEAR_A);
    engine.beginOvertime();
    expect(engine.status).toBe('OVERTIME');

    expect(engine.extractEnergy('a', 'p1').ok).toBe(true);
    expect(engine.status).toBe('FINISHED');
    expect(engine.result().winnerIds).toEqual(['a']);
  });

  it('en modo por puntos, la extracción que alcanza la meta termina la partida', () => {
    const engine = new ArenaEngine({
      config: { endMode: 'POINTS', durationSeconds: null, targetPoints: 2 },
      arena: ARENA,
      rules: { ...RULES, reactor: { ...REACTOR, extractPoints: 2 } },
      players: PLAYERS,
      scenario: scenarioWith(),
    });
    startMatch(engine);
    placePlayer(engine, 'a', ...NEAR_A);

    expect(engine.extractEnergy('a', 'p1').ok).toBe(true);
    expect(engine.status).toBe('FINISHED');
    expect(engine.result().winnerIds).toEqual(['a']);
  });
});
