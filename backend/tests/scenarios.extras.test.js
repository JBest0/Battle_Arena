const fs = require('fs');
const os = require('os');
const path = require('path');
const { ARENA, buildMap } = require('./helpers/obstacleScenario');
const { createScenarioSchema } = require('../src/modules/scenarios/scenario.schema');
const { validateExtras } = require('../src/modules/scenarios/scenario.extras');
const { loadScenarioCatalog } = require('../src/modules/scenarios/scenario.catalog');
const { allReachable } = require('../src/modules/scenarios/scenario.reachability');
const { rectCells } = require('../src/modules/obstacles/rects');

const schema = createScenarioSchema({ cols: 32, rows: 20 });
const PALETTE = {
  floor: '#111111',
  grid: '#222222',
  wall: '#333333',
  wallTop: '#444444',
  reactor: '#555555',
  terminal: '#666666',
  cell: '#777777',
};

function definition(extra = {}, mapOptions = {}) {
  return {
    id: 'prueba',
    name: 'Prueba',
    description: 'Escenario de prueba',
    order: 1,
    palette: PALETTE,
    music: { track: 'x', src: null, volume: 0.5 },
    map: buildMap(mapOptions),
    ...extra,
  };
}
const parse = (extra, mapOptions) => schema.parse(definition(extra, mapOptions));
const problems = (extra, mapOptions) => validateExtras(parse(extra, mapOptions));

const door = { id: 'puerta', col: 7, row: 4, cols: 2, rows: 2 };
const trap = { id: 'trampa', col: 7, row: 4, cols: 2, rows: 2 };

describe('Formato de escenario: secciones opcionales', () => {
  it('un escenario sin secciones es válido y queda con valores vacíos', () => {
    const parsed = parse();

    expect(parsed.obstacles).toEqual({ barriers: [], doors: [], corridors: [] });
    expect(parsed.traps).toEqual([]);
    expect(parsed.riskZones).toEqual([]);
    expect(parsed.randomWalls).toBeNull();
    expect(validateExtras(parsed)).toEqual([]);
  });

  it('completa los valores por defecto de cada elemento', () => {
    const parsed = parse({
      obstacles: {
        doors: [door],
        corridors: [{ id: 'c', col: 3, row: 3, cols: 2, rows: 2 }],
        barriers: [{ id: 'b', cols: 1, rows: 1, route: [[3, 8], [6, 8]] }],
      },
      traps: [trap],
      riskZones: [{ id: 'r', col: 10, row: 4, cols: 2, rows: 2 }],
    });

    expect(parsed.obstacles.doors[0]).toMatchObject({ closedSeconds: 4, openSeconds: 6, offsetSeconds: 0 });
    expect(parsed.obstacles.corridors[0]).toMatchObject({ closedSeconds: 6, minOpenSeconds: 8, maxOpenSeconds: 18 });
    expect(parsed.obstacles.barriers[0]).toMatchObject({ pattern: 'pingpong', periodSeconds: 2.5 });
    expect(parsed.traps[0]).toMatchObject({ slowFactor: 0.45, durationSeconds: 2.5 });
    expect(parsed.riskZones[0]).toMatchObject({ multiplier: 2, exposure: 2 });
  });

  it.each([
    ['puerta fuera del mapa', { obstacles: { doors: [{ ...door, col: 40 }] } }],
    ['multiplicador no entero', { riskZones: [{ ...trap, multiplier: 1.5 }] }],
    ['multiplicador menor que 2', { riskZones: [{ ...trap, multiplier: 1 }] }],
    ['ralentización que no frena', { traps: [{ ...trap, slowFactor: 1 }] }],
    ['id con mayúsculas', { traps: [{ ...trap, id: 'Trampa' }] }],
    ['ruta con una sola posición', { obstacles: { barriers: [{ id: 'b', cols: 1, rows: 1, route: [[3, 8]] }] } }],
    ['mínimo abierto mayor que el máximo', { obstacles: { corridors: [{ ...door, minOpenSeconds: 20, maxOpenSeconds: 10 }] } }],
    ['paredes aleatorias sin zonas', { randomWalls: { maxActive: 2, size: [2, 1], zones: [] } }],
    ['patrón desconocido', { obstacles: { barriers: [{ id: 'b', cols: 1, rows: 1, route: [[3, 8], [6, 8]], pattern: 'zigzag' }] } }],
  ])('rechaza: %s', (_name, extra) => {
    expect(schema.safeParse(definition(extra)).success).toBe(false);
  });
});

describe('validateExtras: geometría contra el mapa', () => {
  it('acepta puertas, trampas y sectores en piso libre', () => {
    expect(
      problems({
        obstacles: { doors: [door] },
        traps: [{ ...trap, id: 't', col: 12, row: 12 }],
        riskZones: [{ id: 'r', col: 20, row: 4, cols: 3, rows: 3 }],
      })
    ).toEqual([]);
  });

  it('rechaza una puerta sobre un muro, el reactor o un inicio', () => {
    expect(problems({ obstacles: { doors: [{ ...door, col: 14, row: 8 }] } }).join()).toMatch(/piso libre/);
    expect(problems({ obstacles: { doors: [{ ...door, col: 1, row: 1 }] } }).join()).toMatch(/piso libre/);
    expect(problems({ obstacles: { doors: [{ ...door, col: 1, row: 2 }] } }).join()).toMatch(/piso libre/);
  });

  it('rechaza obstáculos sobre una terminal o una celda de energía', () => {
    const map = { terminals: [[8, 4]], cells: [[7, 5]] };

    expect(problems({ obstacles: { doors: [door] } }, map).join()).toMatch(/hay "[TC]"/);
  });

  it('rechaza barreras con alguna posición de la ruta fuera de piso libre', () => {
    const barrier = { id: 'b', cols: 2, rows: 2, route: [[3, 8], [14, 7]] };

    expect(problems({ obstacles: { barriers: [barrier] } }).join()).toMatch(/barrera "b" \(posición 2\)/);
  });

  it('rechaza ids repetidos y obstáculos que se traslapan', () => {
    const repeated = problems({ traps: [trap, { ...trap, col: 20 }] }).join();
    expect(repeated).toMatch(/repetido/);

    const overlap = problems({
      obstacles: { doors: [door], corridors: [{ id: 'c', col: 8, row: 4, cols: 2, rows: 2 }] },
    }).join();
    expect(overlap).toMatch(/se traslapa/);

    const sameId = problems({
      obstacles: {
        doors: [door],
        corridors: [{ id: 'puerta', col: 20, row: 4, cols: 2, rows: 2 }],
      },
    }).join();
    expect(sameId).toMatch(/repetido entre barreras, puertas y corredores/);
  });

  it('las trampas no pueden cubrir un inicio; los sectores sí pueden cubrir celdas y terminales', () => {
    expect(problems({ traps: [{ ...trap, col: 1, row: 1, cols: 3, rows: 3 }] }).join()).toMatch(/punto de inicio/);
    expect(problems({ traps: [{ ...trap, col: 13, row: 8 }] }).join()).toMatch(/muro, el reactor/);

    const map = { terminals: [[8, 4]], cells: [[7, 5]] };
    expect(problems({ riskZones: [{ id: 'r', col: 7, row: 4, cols: 3, rows: 3 }] }, map)).toEqual([]);
  });

  it('las zonas de paredes aleatorias respetan celdas y terminales, pero no pueden tocar muros', () => {
    const zones = [{ col: 6, row: 5, cols: 6, rows: 3 }];
    const map = { cells: [[7, 6]], terminals: [[9, 6]] };

    expect(problems({ randomWalls: { maxActive: 2, size: [2, 1], zones } }, map)).toEqual([]);
    expect(
      problems({ randomWalls: { maxActive: 2, size: [2, 1], zones: [{ col: 12, row: 8, cols: 4, rows: 2 }] } }).join()
    ).toMatch(/muro/);
    expect(
      problems({ randomWalls: { maxActive: 2, size: [4, 4], zones: [{ col: 6, row: 5, cols: 3, rows: 3 }] } }).join()
    ).toMatch(/lo bastante grande/);
  });
});

describe('Catálogo con obstáculos', () => {
  const loggerOf = () => ({ error: jest.fn() });

  it('rechaza un escenario con obstáculos inválidos sin afectar a los demás', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'escenarios-'));
    const write = (file, data) => fs.writeFileSync(path.join(dir, file), JSON.stringify(data));
    write('bueno.json', definition({ id: 'bueno', obstacles: { doors: [door] } }));
    write('malo.json', definition({ id: 'malo', obstacles: { doors: [{ ...door, col: 14, row: 8 }] } }));
    const logger = loggerOf();

    const catalog = loadScenarioCatalog({ dir, arena: ARENA, logger });

    expect(catalog.list().map((s) => s.id)).toEqual(['bueno']);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0][0]).toMatch(/malo\.json.*piso libre/);
    expect(catalog.getCompiled('bueno').dynamic.doors).toHaveLength(1);
  });
});

describe('Los 4 escenarios del juego', () => {
  const catalog = loadScenarioCatalog({
    dir: path.join(__dirname, '..', 'src', 'scenarios'),
    arena: ARENA,
    logger: { error: (message) => { throw new Error(message); } },
  });
  const ids = catalog.list().map((s) => s.id);

  it('se cargan todos sin errores', () => {
    expect(ids).toHaveLength(4);
  });

  it.each(ids)('%s tiene obstáculos, trampas y sectores de riesgo', (id) => {
    const { obstacles, traps, riskZones, randomWalls } = catalog.get(id);
    const dynamic =
      obstacles.barriers.length + obstacles.doors.length + obstacles.corridors.length + (randomWalls ? 1 : 0);

    expect(dynamic).toBeGreaterThan(0);
    expect(traps.length).toBeGreaterThan(0);
    expect(riskZones.length).toBeGreaterThan(0);
  });

  it('entre todos usan los cuatro tipos de obstáculo dinámico', () => {
    const all = ids.map((id) => catalog.get(id));

    expect(all.some((s) => s.obstacles.barriers.length > 0)).toBe(true);
    expect(all.some((s) => s.obstacles.doors.length > 0)).toBe(true);
    expect(all.some((s) => s.obstacles.corridors.length > 0)).toBe(true);
    expect(all.some((s) => s.randomWalls)).toBe(true);
  });

  // Un obstáculo que nunca pudiera cerrarse (porque cortaría la única ruta) no serviría de nada.
  it.each(ids)('%s: cada puerta, corredor y posición de barrera puede cerrarse sin cortar rutas', (id) => {
    const scenario = catalog.getCompiled(id);
    const { barriers, doors, corridors } = scenario.dynamic;
    const shapes = [
      ...doors.map((d) => [d.id, rectCells(d)]),
      ...corridors.map((c) => [c.id, rectCells(c)]),
      ...barriers.flatMap((b) =>
        b.route.map(([col, row], i) => [`${b.id}#${i + 1}`, rectCells({ col, row, cols: b.cols, rows: b.rows })])
      ),
    ];

    shapes.forEach(([name, cells]) => {
      const solid = scenario.solid.map((row) => [...row]);
      cells.forEach(({ col, row }) => {
        solid[row][col] = true;
      });
      const ok = allReachable({
        solid,
        cols: scenario.cols,
        rows: scenario.rows,
        reactor: scenario.reactor,
        targets: scenario.targets,
      });

      expect({ name, ok }).toEqual({ name, ok: true });
    });
  });

  it.each(ids)('%s: las trampas son simétricas (mismo número por lado)', (id) => {
    const { traps } = catalog.get(id);
    const left = traps.filter((t) => t.col + t.cols / 2 < 16).length;
    const right = traps.length - left;

    expect(left).toBe(right);
  });
});
