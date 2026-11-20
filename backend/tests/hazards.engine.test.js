const {
  RULES,
  scenarioWith,
  createEngine,
  run,
  startMatch,
  placePlayer,
} = require('./helpers/obstacleScenario');
const { EventFactory } = require('../src/modules/events/eventFactory');
const { ReactorOverloadEvent } = require('../src/modules/events/types/reactorOverload');

const trap = { id: 'aceite', col: 8, row: 5, cols: 3, rows: 3, slowFactor: 0.4, durationSeconds: 2 };
const zone = { id: 'sector', col: 12, row: 5, cols: 3, rows: 3, multiplier: 3, exposure: 2 };
const player = (engine) => engine.snapshot().players[0];

// Pone una celda de energía justo bajo Ana y la recoge; devuelve los puntos.
function collect(engine) {
  const ana = engine.players[0];
  const before = ana.score;
  engine.items = [{ id: 'prueba', x: ana.x, y: ana.y }];
  engine.collectItems();

  return ana.score - before;
}

describe('Trampas de ralentización', () => {
  const make = (extra = {}) =>
    createEngine({ scenario: scenarioWith({ traps: [{ ...trap, ...extra }] }) });

  // Distancia que recorre Ana en `seconds` yendo a la derecha por la fila 12 (sin trampas).
  function travel(engine, seconds) {
    const ana = placePlayer(engine, 'a', 2, 12);
    const start = ana.x;
    engine.setInput('a', 1, 0);
    run(engine, seconds);
    engine.setInput('a', 0, 0);

    return ana.x - start;
  }

  const startedFree = () => {
    const engine = createEngine({ scenario: scenarioWith() });
    startMatch(engine);

    return engine;
  };

  it('al pisarla baja la velocidad y el snapshot lo indica', () => {
    const engine = make();
    startMatch(engine);
    const normal = travel(startedFree(), 0.5);

    placePlayer(engine, 'a', 9, 6); // sobre la trampa
    run(engine, 0.1);
    expect(player(engine).slow).toBeGreaterThan(0);
    expect(player(engine).slow).toBeLessThanOrEqual(2);

    // ya fuera de la trampa sigue ralentizado: recorre ~40 % de lo normal
    expect(normal).toBeGreaterThan(50);
    expect(travel(engine, 0.5)).toBeCloseTo(normal * 0.4, -1);
  });

  it('el efecto vence solo a los durationSeconds de salir', () => {
    const engine = make();
    startMatch(engine);
    placePlayer(engine, 'a', 9, 6);
    run(engine, 0.1);
    placePlayer(engine, 'a', 2, 12); // sale de la trampa
    expect(player(engine).slow).toBeGreaterThan(0);

    run(engine, 2.2);
    expect(player(engine).slow).toBe(0);
    expect(travel(engine, 0.5)).toBeCloseTo(travel(startedFree(), 0.5), 0);
  });

  it('se renueva mientras siga encima', () => {
    const engine = make();
    startMatch(engine);
    placePlayer(engine, 'a', 9, 6);
    run(engine, 5);

    expect(player(engine).slow).toBeGreaterThan(1.5);
  });

  it('con dos trampas aplica la más fuerte', () => {
    const engine = createEngine({
      scenario: scenarioWith({
        traps: [trap, { ...trap, id: 'barro', col: 9, row: 5, slowFactor: 0.2, durationSeconds: 1 }],
      }),
    });
    startMatch(engine);
    placePlayer(engine, 'a', 9, 6);
    run(engine, 0.1);

    expect(engine.players[0].slowFactor).toBe(0.2);
  });

  it('no afecta a quien no la pisa', () => {
    const engine = make();
    startMatch(engine);
    placePlayer(engine, 'a', 9, 6);
    run(engine, 0.1);

    expect(engine.snapshot().players[1].slow).toBe(0);
  });
});

describe('Sectores de riesgo', () => {
  const make = (extra = {}) =>
    createEngine({ scenario: scenarioWith({ riskZones: [{ ...zone, ...extra }] }) });

  it('dentro multiplican los puntos de lo que se recoge y fuera no', () => {
    const engine = make();
    startMatch(engine);

    placePlayer(engine, 'a', 13, 6);
    run(engine, 0.1);
    expect(player(engine).risk).toBe(3);
    expect(collect(engine)).toBe(3);

    placePlayer(engine, 'a', 3, 12);
    run(engine, 0.1);
    expect(player(engine).risk).toBe(1);
    expect(collect(engine)).toBe(1);
  });

  it('el efecto termina al salir de la zona', () => {
    const engine = make();
    startMatch(engine);
    placePlayer(engine, 'a', 13, 6);
    run(engine, 0.1);
    expect(engine.players[0].exposure).toBe(2);

    placePlayer(engine, 'a', 20, 12);
    run(engine, 0.1);
    expect(player(engine).risk).toBe(1);
    expect(engine.players[0].exposure).toBe(1);
  });

  it('se suma al multiplicador de un evento (x2 por sobrecarga)', () => {
    const factory = new EventFactory().register(ReactorOverloadEvent);
    const engine = createEngine({
      scenario: scenarioWith({ riskZones: [zone] }),
      eventFactory: factory,
      rules: { ...RULES, eventIntervalSeconds: 10, eventDurationSeconds: 5 },
    });
    startMatch(engine);
    run(engine, 10.3); // empieza la sobrecarga
    placePlayer(engine, 'a', 13, 6);
    run(engine, 0.1);

    expect(collect(engine)).toBe(6);
  });

  it('también cubre terminales y celdas de energía', () => {
    const engine = createEngine({
      scenario: scenarioWith({ map: { cells: [[13, 6]], terminals: [[14, 6]] }, riskZones: [zone] }),
    });
    startMatch(engine);
    placePlayer(engine, 'a', 13, 6);
    run(engine, 0.1);

    expect(player(engine).risk).toBe(3);
  });
});

describe('Escenario sin trampas ni sectores', () => {
  it('los efectos quedan en su valor normal', () => {
    const engine = createEngine({ scenario: scenarioWith() });
    startMatch(engine);
    run(engine, 1);

    expect(player(engine)).toMatchObject({ slow: 0, risk: 1 });
    expect(engine.snapshot().obstacles).toEqual([]);
  });
});
