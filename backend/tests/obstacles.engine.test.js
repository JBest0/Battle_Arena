const {
  ARENA,
  scenarioWith,
  createEngine,
  run,
  startMatch,
  placePlayer,
} = require('./helpers/obstacleScenario');

const size = ARENA.cellSize;
const at = (engine, col, row) => engine.solid[row][col];
const obstacle = (engine, id) => engine.snapshot().obstacles.find((item) => item.id === id);

describe('Barreras móviles', () => {
  const barrier = {
    id: 'cinta',
    cols: 1,
    rows: 2,
    route: [[5, 4], [8, 4], [11, 4]],
    pattern: 'pingpong',
    periodSeconds: 2,
  };
  const make = (extra = {}) =>
    createEngine({ scenario: scenarioWith({ obstacles: { barriers: [{ ...barrier, ...extra }] } }) });

  it('empieza en la primera posición de su ruta y ocupa sus celdas', () => {
    const engine = make();

    expect(obstacle(engine, 'cinta')).toMatchObject({
      kind: 'barrier',
      col: 5,
      row: 4,
      cols: 1,
      rows: 2,
      closed: true,
    });
    expect(at(engine, 5, 4)).toBe(true);
    expect(at(engine, 5, 5)).toBe(true);
    expect(at(engine, 8, 4)).toBe(false);
  });

  it('cambia de posición según su patrón (ida y vuelta)', () => {
    const engine = make();
    startMatch(engine);
    const cols = [];

    for (let i = 0; i < 6; i += 1) {
      run(engine, 2.05);
      cols.push(obstacle(engine, 'cinta').col);
    }

    expect(cols).toEqual([8, 11, 8, 5, 8, 11]);
  });

  it('en círculo vuelve a la primera posición', () => {
    const engine = make({ pattern: 'loop' });
    startMatch(engine);
    const cols = [];

    for (let i = 0; i < 4; i += 1) {
      run(engine, 2.05);
      cols.push(obstacle(engine, 'cinta').col);
    }

    expect(cols).toEqual([8, 11, 5, 8]);
  });

  it('deja libre la celda que abandona y bloquea la que ocupa', () => {
    const engine = make();
    startMatch(engine);
    run(engine, 2.05);

    expect(at(engine, 5, 4)).toBe(false);
    expect(at(engine, 8, 4)).toBe(true);
    expect(at(engine, 8, 5)).toBe(true);
  });

  it('un jugador no la atraviesa mientras ocupa una celda', () => {
    const engine = make();
    startMatch(engine);
    const ana = placePlayer(engine, 'a', 3, 4);
    engine.setInput('a', 1, 0);
    run(engine, 1.5); // menos que el periodo (2 s): la barrera sigue en la columna 5

    expect(ana.x).toBeLessThanOrEqual(5 * size - ARENA.collisionRadius + 0.5);
    expect(engine.collides(ana.x, ana.y, ARENA.collisionRadius)).toBe(false);
  });

  it('no se mueve encima de un jugador: espera y avanza cuando se va', () => {
    const engine = make();
    startMatch(engine);
    const ana = placePlayer(engine, 'a', 8, 4); // justo donde iría
    run(engine, 2.5);

    expect(obstacle(engine, 'cinta').col).toBe(5);

    placePlayer(engine, 'a', 3, 10);
    run(engine, 0.5);

    expect(obstacle(engine, 'cinta').col).toBe(8);
    expect(engine.collides(ana.x, ana.y, ARENA.collisionRadius)).toBe(false);
  });

  it('avisa antes de moverse (warning)', () => {
    const engine = make();
    startMatch(engine);
    run(engine, 0.5);
    expect(obstacle(engine, 'cinta').warning).toBe(false);

    run(engine, 1.1); // quedan ~0,4 s
    expect(obstacle(engine, 'cinta').warning).toBe(true);
  });
});

describe('Puertas automáticas', () => {
  const door = { id: 'puerta', col: 7, row: 4, cols: 2, rows: 3, closedSeconds: 3, openSeconds: 5, offsetSeconds: 0 };
  const make = (extra = {}) =>
    createEngine({ scenario: scenarioWith({ obstacles: { doors: [{ ...door, ...extra }] } }) });

  it('empieza cerrada si su ciclo lo indica y se abre y cierra por ciclo', () => {
    const engine = make();
    expect(obstacle(engine, 'puerta')).toMatchObject({ kind: 'door', closed: true });
    expect(at(engine, 7, 4)).toBe(true);
    startMatch(engine);

    run(engine, 3.1);
    expect(obstacle(engine, 'puerta').closed).toBe(false);
    expect(at(engine, 7, 4)).toBe(false);

    run(engine, 5.1);
    expect(obstacle(engine, 'puerta').closed).toBe(true);
    expect(at(engine, 8, 6)).toBe(true);
  });

  it('el desfase hace que empiece en otro punto del ciclo', () => {
    const engine = make({ offsetSeconds: 4 }); // 4 > 3 s cerrada: arranca abierta, 4 s más
    expect(obstacle(engine, 'puerta').closed).toBe(false);
    expect(at(engine, 7, 4)).toBe(false);

    startMatch(engine);
    run(engine, 4.3);
    expect(obstacle(engine, 'puerta').closed).toBe(true);
  });

  it('no se cierra sobre un jugador: espera a que salga', () => {
    const engine = make({ offsetSeconds: 4 });
    startMatch(engine);
    const ana = placePlayer(engine, 'a', 8, 5); // en medio de la puerta
    run(engine, 6);

    expect(obstacle(engine, 'puerta').closed).toBe(false);
    expect(engine.collides(ana.x, ana.y, ARENA.collisionRadius)).toBe(false);

    placePlayer(engine, 'a', 3, 10);
    run(engine, 0.5);
    expect(obstacle(engine, 'puerta').closed).toBe(true);
  });

  it('avisa antes de cerrarse', () => {
    const engine = make({ offsetSeconds: 3 }); // abierta, 5 s
    startMatch(engine);
    run(engine, 4.6);

    expect(obstacle(engine, 'puerta').warning).toBe(true);
  });
});

describe('Corredores bloqueados', () => {
  const corridor = {
    id: 'esclusa',
    col: 6,
    row: 3,
    cols: 2,
    rows: 4,
    closedSeconds: 3,
    minOpenSeconds: 4,
    maxOpenSeconds: 8,
  };
  const make = (seed) =>
    createEngine({
      seed,
      scenario: scenarioWith({ obstacles: { corridors: [corridor] } }),
    });
  const history = (seed) => {
    const engine = make(seed);
    startMatch(engine);
    const log = [];
    let last = null;
    for (let i = 0; i < 1500; i += 1) {
      engine.step(0.1);
      const closed = obstacle(engine, 'esclusa').closed;
      if (closed !== last) {
        log.push([Math.round(engine.elapsed * 10) / 10, closed]);
        last = closed;
      }
    }

    return log;
  };

  it('empieza abierto, se cierra un rato y se reabre', () => {
    const engine = make(5);
    expect(obstacle(engine, 'esclusa').closed).toBe(false);

    const log = history(5);
    expect(log.length).toBeGreaterThan(6);
    // el cierre dura siempre 3 s y la apertura queda entre 4 y 8 s
    for (let i = 1; i < log.length - 1; i += 1) {
      const lasted = log[i + 1][0] - log[i][0];
      if (log[i][1]) expect(lasted).toBeCloseTo(3, 0);
      else {
        expect(lasted).toBeGreaterThanOrEqual(3.9);
        expect(lasted).toBeLessThanOrEqual(8.3);
      }
    }
  });

  it('con la misma semilla ocurre lo mismo; con otra, distinto', () => {
    expect(history(7)).toEqual(history(7));
    expect(history(7)).not.toEqual(history(8));
  });
});

describe('Nunca se cierran todas las rutas al reactor', () => {
  // Un pasillo de 2 celdas es la única conexión entre la mitad izquierda y la derecha:
  // se levantan muros arriba y abajo y se deja una sola puerta.
  const walls = [];
  for (let row = 1; row <= 18; row += 1) {
    if (row !== 9 && row !== 10) {
      walls.push([22, row]);
      walls.push([23, row]);
    }
  }
  const door = { id: 'unica', col: 22, row: 9, cols: 2, rows: 2, closedSeconds: 3, openSeconds: 2, offsetSeconds: 0 };

  it('una puerta que es la única ruta se queda abierta en vez de cortar el mapa', () => {
    // la terminal y los inicios de la derecha quedarían aislados si se cerrara
    const engine = createEngine({
      scenario: scenarioWith({ map: { walls }, obstacles: { doors: [door] } }),
    });
    startMatch(engine);

    for (let i = 0; i < 300; i += 1) {
      engine.step(0.1);
      expect(obstacle(engine, 'unica').closed).toBe(false);
      expect(at(engine, 22, 9)).toBe(false);
    }
  });

  it('si hay otra ruta, sí se cierra', () => {
    const open = walls.filter(([, row]) => row !== 15 && row !== 16); // segundo pasillo
    const engine = createEngine({
      scenario: scenarioWith({ map: { walls: open }, obstacles: { doors: [door] } }),
    });

    expect(obstacle(engine, 'unica').closed).toBe(true);
  });

  it('una barrera no se mueve si al hacerlo cortaría una ruta', () => {
    const barrier = { id: 'tapon', cols: 2, rows: 2, route: [[22, 9], [18, 9]], pattern: 'pingpong', periodSeconds: 1 };
    const engine = createEngine({
      scenario: scenarioWith({ map: { walls }, obstacles: { barriers: [barrier] } }),
    });

    // en [22,9] corta la única ruta: no puede colocarse al empezar
    expect(engine.snapshot().obstacles).toEqual([]);
    startMatch(engine);
    run(engine, 5);
    expect(at(engine, 22, 9)).toBe(false);
  });

  it('una pared aleatoria no cae donde cortaría una ruta', () => {
    const engine = createEngine({
      scenario: scenarioWith({
        map: { walls },
        randomWalls: { maxActive: 5, size: [2, 2], zones: [{ col: 21, row: 8, cols: 4, rows: 4 }] },
      }),
      rules: { randomWallIntervalSeconds: 5 },
    });
    startMatch(engine);
    run(engine, 60);

    expect(at(engine, 22, 9)).toBe(false);
    expect(at(engine, 23, 10)).toBe(false);
  });
});

describe('Paredes aleatorias', () => {
  const zones = [{ col: 5, row: 5, cols: 8, rows: 4 }, { col: 19, row: 12, cols: 8, rows: 4 }];
  const make = ({ seed = 1, maxActive = 3, size = [2, 1], map = {} } = {}) =>
    createEngine({
      seed,
      scenario: scenarioWith({ map, randomWalls: { maxActive, size, zones } }),
      rules: { randomWallIntervalSeconds: 5 },
    });
  const walls = (engine) => engine.snapshot().obstacles.filter((item) => item.kind === 'wall');

  it('no hay paredes al empezar y aparecen cada intervalo, dentro de las zonas', () => {
    const engine = make();
    expect(walls(engine)).toEqual([]);

    startMatch(engine);
    run(engine, 5.2);
    expect(walls(engine)).toHaveLength(1);
    run(engine, 5);

    walls(engine).forEach((wall) => {
      const inZone = zones.some(
        (z) =>
          wall.col >= z.col &&
          wall.col + wall.cols <= z.col + z.cols &&
          wall.row >= z.row &&
          wall.row + wall.rows <= z.row + z.rows
      );
      expect(inZone).toBe(true);
      expect(at(engine, wall.col, wall.row)).toBe(true);
    });
  });

  it('nunca pasan del máximo y también desaparecen', () => {
    const engine = make({ maxActive: 2 });
    startMatch(engine);
    let removed = false;
    let previous = 0;

    for (let i = 0; i < 3000; i += 1) {
      engine.step(0.1);
      const count = walls(engine).length;
      expect(count).toBeLessThanOrEqual(2);
      if (count < previous) removed = true;
      previous = count;
    }

    expect(removed).toBe(true);
  });

  it('los jugadores no las atraviesan', () => {
    const engine = make({ maxActive: 4 });
    startMatch(engine);
    run(engine, 30);
    const [wall] = walls(engine);
    expect(wall).toBeDefined();
    engine.obstacles.items[0].timer = 1e9; // que no cambie nada mientras se prueba el choque

    const ana = placePlayer(engine, 'a', wall.col - 2, wall.row);
    engine.setInput('a', 1, 0);
    run(engine, 1.5);

    expect(engine.collides(ana.x, ana.y, ARENA.collisionRadius)).toBe(false);
    expect(ana.x).toBeLessThan((wall.col + wall.cols) * size);
  });

  it('si cayera sobre alguien se coloca en otra celda y nunca lo atrapa', () => {
    const engine = make({ seed: 3, maxActive: 4 });
    startMatch(engine);
    const ana = placePlayer(engine, 'a', 8, 6);
    // el jugador se queda quieto en medio de la zona mientras caen las paredes
    for (let i = 0; i < 4000; i += 1) {
      engine.step(0.1);
      expect(engine.collides(ana.x, ana.y, ARENA.collisionRadius - 0.5)).toBe(false);
    }
    expect(walls(engine).length).toBeGreaterThan(0);
  });

  it('no caen sobre terminales ni celdas de energía', () => {
    const engine = make({ map: { cells: [[6, 5], [7, 5], [9, 7]], terminals: [[11, 6]] }, maxActive: 8 });
    startMatch(engine);
    run(engine, 200);

    [[6, 5], [7, 5], [9, 7], [11, 6]].forEach(([col, row]) => expect(at(engine, col, row)).toBe(false));
  });

  it('con la misma semilla la secuencia se repite; con otra, cambia', () => {
    const sequence = (seed) => {
      const engine = make({ seed, maxActive: 4 });
      startMatch(engine);
      const log = [];
      for (let i = 0; i < 100; i += 1) {
        run(engine, 5);
        log.push(walls(engine).map((w) => `${w.id}@${w.col},${w.row}`).join('|'));
      }

      return log;
    };

    expect(sequence(11)).toEqual(sequence(11));
    expect(sequence(11)).not.toEqual(sequence(12));
  });

  it('retira de la celda las celdas de energía que quedaron dentro', () => {
    const engine = make({ maxActive: 8 });
    startMatch(engine);
    engine.items = [];
    for (let i = 0; i < 400; i += 1) {
      engine.step(0.1);
      engine.items.forEach((item) => {
        expect(engine.collides(item.x, item.y, ARENA.itemRadius)).toBe(false);
      });
    }
  });
});

describe('Convivencia con la ruta alternativa (eventos)', () => {
  it('abrir un muro del mapa no se confunde con un obstáculo cerrado', () => {
    const wall = [[6, 5], [7, 5]];
    const door = { id: 'p', col: 12, row: 3, cols: 2, rows: 2, closedSeconds: 50, openSeconds: 5, offsetSeconds: 0 };
    const engine = createEngine({
      scenario: scenarioWith({ map: { walls: wall }, obstacles: { doors: [door] } }),
    });

    engine.openWall(6, 5);
    expect(at(engine, 6, 5)).toBe(false);
    engine.requestWallClose([{ col: 6, row: 5 }]);
    engine.closePendingWalls();
    expect(at(engine, 6, 5)).toBe(true);
    // la puerta (que no es del mapa) no se puede "abrir" como un muro
    engine.openWall(12, 3);
    expect(at(engine, 12, 3)).toBe(true);
  });

  it('el muro de un evento no se vuelve a cerrar si eso cortaría una ruta', () => {
    // Pared que parte en dos el mapa salvo por un hueco que abrió el evento
    const wall = [];
    for (let row = 1; row <= 18; row += 1) {
      wall.push([22, row]);
      wall.push([23, row]);
    }
    const engine = createEngine({ scenario: scenarioWith({ map: { walls: wall } }) });
    // El mapa del escenario es inválido para jugar (incomunicado): se abre un hueco y se
    // comprueba que cerrarlo se pospone mientras no haya otra ruta.
    [9, 10].forEach((row) => [22, 23].forEach((col) => engine.openWall(col, row)));
    engine.requestWallClose([9, 10].flatMap((row) => [22, 23].map((col) => ({ col, row }))));
    engine.closePendingWalls();

    expect(at(engine, 22, 9)).toBe(false);
  });
});
