const {
  ARENA,
  scenarioWith,
  createEngine,
  run,
  startMatch,
  placePlayer,
} = require('./helpers/obstacleScenario');
const { GUARDIANS } = require('../src/modules/game/game.config');
const { EventFactory } = require('../src/modules/events/eventFactory');
const { GuardianInvasionEvent } = require('../src/modules/events/types/guardianInvasion');

// US-21: guardianes y estados temporales del jugador. CA-22.2: invasión de guardianes.
// El escenario de prueba es un campo abierto de 32 × 20 celdas con el reactor al centro y
// los inicios en las cuatro esquinas.

const rulesWith = (overrides = {}) => ({ guardians: { ...GUARDIANS, ...overrides } });
const publicPlayer = (engine, id) => engine.snapshot().players.find((p) => p.id === id);
const cellCenter = (col, row) => ({
  x: col * ARENA.cellSize + ARENA.cellSize / 2,
  y: row * ARENA.cellSize + ARENA.cellSize / 2,
});

// Partida iniciada con `count` guardianes y a los jugadores lejos de ellos.
function started({ count = 1, scenario = scenarioWith(), rules = {}, ...options } = {}) {
  const engine = createEngine({
    scenario,
    rules: { ...rulesWith({ count }), ...rules },
    ...options,
  });
  startMatch(engine);

  return engine;
}

// Pone a un guardián encima de un jugador (para probar el contacto sin esperar a que llegue).
function putOn(guardian, player) {
  guardian.x = player.x;
  guardian.y = player.y;
}

describe('Guardianes: colocación (CA-21.1)', () => {
  it('hay cuatro guardianes, uno en cada extremo del campo, sobre suelo libre', () => {
    const engine = createEngine({ scenario: scenarioWith(), rules: rulesWith() });
    const { guardians } = engine.snapshot();

    expect(guardians).toHaveLength(4);
    expect(new Set(guardians.map((g) => g.id)).size).toBe(4);
    expect(guardians.filter((g) => g.y <= 60)).toHaveLength(1); // arriba
    expect(guardians.filter((g) => g.y >= ARENA.height - 60)).toHaveLength(1); // abajo
    expect(guardians.filter((g) => g.x <= 60)).toHaveLength(1); // izquierda
    expect(guardians.filter((g) => g.x >= ARENA.width - 60)).toHaveLength(1); // derecha
    guardians.forEach((g) => {
      expect(engine.collides(g.x, g.y, ARENA.collisionRadius)).toBe(false);
      expect(g.extra).toBe(false);
    });
  });

  it('ninguno nace sobre un inicio: nadie se congela antes de moverse', () => {
    const engine = createEngine({ scenario: scenarioWith(), rules: rulesWith() });

    engine.players.forEach((player) => {
      engine.guardians.guardians.forEach((g) => {
        expect(Math.hypot(g.x - player.x, g.y - player.y)).toBeGreaterThan(100);
      });
    });
  });

  it('sin reglas de guardianes o sin escenario, la partida no los tiene', () => {
    const plain = createEngine({ scenario: scenarioWith() });
    const noScenario = createEngine({ rules: rulesWith() });

    expect(plain.guardians).toBeNull();
    expect(plain.snapshot().guardians).toEqual([]);
    expect(noScenario.guardians).toBeNull();
  });

  it('los jugadores empiezan en estado normal', () => {
    const engine = createEngine({ scenario: scenarioWith(), rules: rulesWith() });

    engine.snapshot().players.forEach((player) => {
      expect(player.state).toBe('normal');
      expect(player.frozen).toBe(0);
    });
  });
});

describe('Guardianes: persecución (CA-21.2, CA-21.11)', () => {
  it('persiguen al jugador más cercano y se le acercan', () => {
    const engine = started();
    const [guardian] = engine.guardians.guardians; // arriba, en el centro
    const ana = placePlayer(engine, 'a', 16, 7);
    placePlayer(engine, 'b', 2, 17);

    const before = Math.hypot(guardian.x - ana.x, guardian.y - ana.y);
    run(engine, 0.3);
    expect(engine.snapshot().guardians[0].targetId).toBe('a');

    run(engine, 0.5);
    expect(Math.hypot(guardian.x - ana.x, guardian.y - ana.y)).toBeLessThan(before);
    expect(publicPlayer(engine, 'a').state).toBe('normal'); // todavía no lo alcanzó
  });

  it('si otro jugador pasa a estar más cerca, cambia de objetivo', () => {
    const engine = started();
    placePlayer(engine, 'a', 16, 7);
    placePlayer(engine, 'b', 2, 17);
    run(engine, 0.3);
    expect(engine.snapshot().guardians[0].targetId).toBe('a');

    const [guardian] = engine.guardians.guardians;
    placePlayer(engine, 'a', 2, 17);
    placePlayer(engine, 'b', 16, 7);
    guardian.x = cellCenter(16, 3).x;
    guardian.y = cellCenter(16, 3).y;
    run(engine, 0.3);

    expect(engine.snapshot().guardians[0].targetId).toBe('b');
  });

  it('se mueven más despacio que un jugador: se les puede huir', () => {
    expect(GUARDIANS.speed).toBeLessThan(220);
  });

  it('si su objetivo se congela, buscan a otro (CA-21.11)', () => {
    const engine = started();
    const ana = placePlayer(engine, 'a', 16, 4);
    placePlayer(engine, 'b', 2, 17);
    run(engine, 0.3);
    expect(engine.snapshot().guardians[0].targetId).toBe('a');

    engine.freezePlayer(ana, 5);
    run(engine, 0.1);

    expect(engine.snapshot().guardians[0].targetId).toBe('b');
  });

  it('sin jugadores que perseguir se quedan quietos', () => {
    const engine = started();
    engine.players.forEach((player) => engine.freezePlayer(player, 30));
    run(engine, 0.3);
    const [before] = engine.snapshot().guardians;

    run(engine, 1);
    const [after] = engine.snapshot().guardians;

    expect(after.targetId).toBeNull();
    expect([after.x, after.y]).toEqual([before.x, before.y]);
  });
});

describe('Guardianes: congelamiento (CA-21.3 a CA-21.9)', () => {
  it('al tocar a un jugador lo congela el tiempo configurado y no cambia su puntaje', () => {
    const engine = started();
    const ana = placePlayer(engine, 'a', 8, 5);
    putOn(engine.guardians.guardians[0], ana);
    run(engine, 0.1);

    const view = publicPlayer(engine, 'a');
    expect(view.state).toBe('frozen');
    expect(view.frozen).toBeGreaterThan(GUARDIANS.freezeSeconds - 0.3);
    expect(view.frozen).toBeLessThanOrEqual(GUARDIANS.freezeSeconds);
    expect(view.score).toBe(0);
    expect(publicPlayer(engine, 'b').state).toBe('normal');
  });

  it('el tiempo de congelamiento es configurable', () => {
    const engine = started({ rules: rulesWith({ count: 1, freezeSeconds: 6 }) });
    const ana = placePlayer(engine, 'a', 8, 5);
    putOn(engine.guardians.guardians[0], ana);
    run(engine, 0.1);

    expect(publicPlayer(engine, 'a').frozen).toBeGreaterThan(5.5);
  });

  it('congelado no se mueve aunque mantenga la dirección, y lo hace al descongelarse', () => {
    const engine = started();
    const ana = placePlayer(engine, 'a', 8, 5);
    placePlayer(engine, 'b', 29, 17);
    putOn(engine.guardians.guardians[0], ana);
    const startX = ana.x;

    engine.setInput('a', 1, 0);
    run(engine, 1.5);
    expect(publicPlayer(engine, 'a').state).toBe('frozen');
    expect(ana.x).toBe(startX);

    run(engine, GUARDIANS.freezeSeconds); // vence el congelamiento
    expect(publicPlayer(engine, 'a').state).toBe('normal');
    expect(publicPlayer(engine, 'a').frozen).toBe(0);
    expect(ana.x).toBeGreaterThan(startX); // recuperó el movimiento sin volver a pedirlo
  });

  it('congelado no recoge celdas; las recoge al descongelarse', () => {
    const engine = started();
    const ana = placePlayer(engine, 'a', 8, 5);
    placePlayer(engine, 'b', 29, 17);
    engine.freezePlayer(ana, 2);

    engine.items = [{ id: 'prueba', x: ana.x, y: ana.y }];
    engine.collectItems();
    expect(ana.score).toBe(0);
    expect(engine.items).toHaveLength(1);

    run(engine, 2.2);
    expect(ana.score).toBeGreaterThanOrEqual(1);
  });

  it('los demás ven el estado: el snapshot lo trae para todos los jugadores', () => {
    const engine = started();
    placePlayer(engine, 'a', 8, 5);
    engine.freezePlayer(engine.players[0], 4);

    const [ana, beto] = engine.snapshot().players;
    expect([ana.state, beto.state]).toEqual(['frozen', 'normal']);
    expect(ana.frozen).toBeGreaterThan(3.5);
  });

  it('si ya tenía tiempo de no movimiento por una trampa, el congelamiento se suma (CA-21.10)', () => {
    const engine = started();
    const ana = placePlayer(engine, 'a', 8, 5);
    ana.slowFactor = 0.4;
    ana.slowUntil = engine.elapsed + 2;
    putOn(engine.guardians.guardians[0], ana);
    run(engine, 0.1);

    // 3 s de congelamiento + ~1,9 s de ralentización que le quedaban
    expect(publicPlayer(engine, 'a').frozen).toBeGreaterThan(4.5);
  });

  it('varios guardianes sobre el mismo jugador lo congelan una sola vez', () => {
    const engine = started({ count: 4 });
    const ana = placePlayer(engine, 'a', 8, 5);
    engine.guardians.guardians.forEach((guardian) => putOn(guardian, ana));
    run(engine, 0.1);

    expect(publicPlayer(engine, 'a').frozen).toBeLessThanOrEqual(GUARDIANS.freezeSeconds);
  });

  it('al descongelarse hay unos segundos de gracia en los que no se vuelve a congelar', () => {
    const engine = started();
    const ana = placePlayer(engine, 'a', 8, 5);
    placePlayer(engine, 'b', 29, 17);
    engine.freezePlayer(ana, 1);
    run(engine, 1.1);
    expect(publicPlayer(engine, 'a').state).toBe('normal');

    putOn(engine.guardians.guardians[0], ana); // el guardián está encima, pero hay gracia
    run(engine, 0.3);
    expect(publicPlayer(engine, 'a').state).toBe('normal');

    run(engine, GUARDIANS.graceSeconds + 0.2); // terminó la gracia
    putOn(engine.guardians.guardians[0], ana);
    run(engine, 0.1);
    expect(publicPlayer(engine, 'a').state).toBe('frozen');
  });

  it('un guardián no otorga ni quita puntos', () => {
    const engine = started({ count: 4 });
    engine.players[0].score = 7;
    engine.players.forEach((player) => engine.guardians.guardians.forEach((g) => putOn(g, player)));
    run(engine, 0.5);

    expect(publicPlayer(engine, 'a').score).toBe(7);
    expect(publicPlayer(engine, 'b').score).toBe(0);
  });

  it('el congelamiento solo lo decide el servidor: la entrada del jugador no lo altera', () => {
    const engine = started();
    const ana = placePlayer(engine, 'a', 8, 5);
    engine.freezePlayer(ana, 3);

    engine.setInput('a', 1, 1);
    engine.setInput('a', 0, 0);
    engine.setInput('a', Number.NaN, Infinity);

    expect(publicPlayer(engine, 'a').state).toBe('frozen');
    expect(publicPlayer(engine, 'a').frozen).toBeGreaterThan(2.9);
  });

  it('terminada la partida los guardianes dejan de actuar', () => {
    const engine = started({ count: 4 });
    const ana = placePlayer(engine, 'a', 8, 5);
    engine.finish();

    putOn(engine.guardians.guardians[0], ana);
    const before = JSON.stringify(engine.snapshot().guardians);
    run(engine, 1);

    expect(JSON.stringify(engine.snapshot().guardians)).toBe(before);
    expect(publicPlayer(engine, 'a').state).toBe('normal');
  });
});

describe('Guardianes y muros (CA-20.3, CA-20.8)', () => {
  // Muro vertical en la columna 10 (filas 1 a 14); solo se puede pasar por abajo.
  const wallColumn = Array.from({ length: 14 }, (_, i) => [10, i + 1]);

  it('rodean los muros en vez de atravesarlos y llegan al jugador', () => {
    const engine = started({
      scenario: scenarioWith({ map: { walls: wallColumn } }),
      rules: rulesWith({ count: 1, speed: 200 }),
    });
    const [guardian] = engine.guardians.guardians;
    const ana = placePlayer(engine, 'a', 8, 5);
    placePlayer(engine, 'b', 29, 17);
    Object.assign(guardian, cellCenter(12, 5));

    let frozenAt = null;
    for (let step = 0; step < 300 && frozenAt === null; step += 1) {
      engine.step(0.1);
      expect(engine.collides(guardian.x, guardian.y, ARENA.collisionRadius - 0.5)).toBe(false);
      if (step === 10) expect(guardian.x).toBeGreaterThan(11 * ARENA.cellSize); // no cruzó el muro
      if (publicPlayer(engine, 'a').state === 'frozen') frozenAt = step;
    }

    expect(frozenAt).not.toBeNull();
    expect(Math.hypot(guardian.x - ana.x, guardian.y - ana.y)).toBeLessThanOrEqual(
      GUARDIANS.touchRadius + 1
    );
  });

  it('si un obstáculo se cierra sobre un guardián, se le saca del muro', () => {
    const engine = started();
    const [guardian] = engine.guardians.guardians;
    Object.assign(guardian, cellCenter(12, 5));

    expect(engine.tryBlocks({ add: [{ col: 12, row: 5 }] })).toBe(true);
    expect(engine.collides(guardian.x, guardian.y, ARENA.collisionRadius - 0.5)).toBe(true);

    run(engine, 0.3);
    expect(engine.collides(guardian.x, guardian.y, ARENA.collisionRadius - 0.5)).toBe(false);
  });
});

describe('Evento: invasión de guardianes (CA-22.2)', () => {
  const invasionFactory = () => new EventFactory().register(GuardianInvasionEvent);
  const withInvasion = () =>
    started({
      count: 4,
      eventFactory: invasionFactory(),
      // intervalo corto: el evento llega antes de que los guardianes alcancen a nadie
      rules: { ...rulesWith({ count: 4 }), eventIntervalSeconds: 1, eventDurationSeconds: 5 },
    });

  // Avanza hasta que el evento empieza.
  function untilInvasion(engine) {
    while (!engine.events.active && engine.elapsed < 60) engine.step(0.1);
  }

  it('aparecen 5 guardianes extra, lejos de los jugadores, y desaparecen al terminar', () => {
    const engine = withInvasion();
    expect(engine.snapshot().guardians).toHaveLength(4);

    untilInvasion(engine);
    expect(engine.events.active.record.type).toBe('guardian-invasion');
    const during = engine.snapshot().guardians;
    const extras = during.filter((g) => g.extra);

    expect(during).toHaveLength(9);
    expect(extras).toHaveLength(5);
    expect(engine.snapshot().events[0].params.count).toBe(5);
    extras.forEach((g) => {
      expect(engine.collides(g.x, g.y, ARENA.collisionRadius)).toBe(false);
      engine.players.forEach((p) => {
        expect(Math.hypot(g.x - p.x, g.y - p.y)).toBeGreaterThanOrEqual(
          GUARDIANS.invasionMinDistance
        );
      });
    });

    while (engine.events.active) engine.step(0.1);
    const after = engine.snapshot().guardians;
    expect(after).toHaveLength(4);
    expect(after.some((g) => g.extra)).toBe(false);
  });

  it('los extra se comportan igual que los permanentes: persiguen y congelan', () => {
    const engine = withInvasion();
    untilInvasion(engine);
    run(engine, 0.3);

    const extras = engine.guardians.guardians.filter((g) => g.extra);
    expect(extras.some((g) => g.targetId !== null)).toBe(true);

    const beto = engine.players[1];
    putOn(extras[0], beto);
    run(engine, 0.1);
    expect(publicPlayer(engine, 'b').state).toBe('frozen');
  });

  it('un evento no se aplica dos veces: la invasión activa no suma más guardianes', () => {
    const engine = withInvasion();
    untilInvasion(engine);
    run(engine, 1);

    expect(engine.snapshot().guardians).toHaveLength(9);
  });

  it('el evento solo se elige si la partida tiene guardianes', () => {
    const factory = invasionFactory();
    const without = createEngine({ scenario: scenarioWith() });
    const withGuards = createEngine({ scenario: scenarioWith(), rules: rulesWith() });

    expect(factory.canStart('guardian-invasion', without)).toBe(false);
    expect(factory.canStart('guardian-invasion', withGuards)).toBe(true);
  });

  it('al terminar la partida durante el evento, los extra se retiran (CA-22.8)', () => {
    const engine = withInvasion();
    untilInvasion(engine);
    expect(engine.snapshot().guardians).toHaveLength(9);

    engine.finish();

    expect(engine.snapshot().guardians).toHaveLength(4);
    expect(engine.result().events[0].type).toBe('guardian-invasion');
    expect(engine.result().events[0].endedAt).not.toBeNull();
  });
});
