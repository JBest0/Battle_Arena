const fs = require('fs');
const os = require('os');
const path = require('path');
const { ARENA } = require('../src/modules/game/game.config');
const { createScenarioSchema } = require('../src/modules/scenarios/scenario.schema');
const {
  parseMap,
  validateMap,
  compileScenario,
} = require('../src/modules/scenarios/scenario.map');
const {
  ScenarioCatalog,
  loadScenarioCatalog,
} = require('../src/modules/scenarios/scenario.catalog');

const COLS = ARENA.width / ARENA.cellSize;
const ROWS = ARENA.height / ARENA.cellSize;
const schema = createScenarioSchema({ cols: COLS, rows: ROWS });
const SHIPPED_DIR = path.join(__dirname, '..', 'src', 'scenarios');

// Mapa abierto y válido: borde de muros, reactor 4 × 4 al centro y cuatro inicios.
function openMap() {
  const rows = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) =>
      r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1 ? '#' : '.'
    )
  );
  for (let r = 8; r <= 11; r += 1) for (let c = 14; c <= 17; c += 1) rows[r][c] = 'R';
  rows[1][1] = '1';
  rows[18][30] = '2';
  rows[1][30] = '3';
  rows[18][1] = '4';

  return rows.map((row) => row.join(''));
}

function withCell(map, col, row, ch) {
  const copy = map.map((line) => [...line]);
  copy[row][col] = ch;

  return copy.map((line) => line.join(''));
}

function definition(overrides = {}) {
  return {
    id: 'prueba',
    name: 'Escenario de prueba',
    description: 'Mapa abierto para pruebas',
    order: 1,
    palette: {
      floor: '#111111',
      grid: '#222222',
      wall: '#333333',
      wallTop: '#444444',
      reactor: '#555555',
      terminal: '#666666',
      cell: '#777777',
    },
    music: { track: 'silencio', src: null, volume: 0.5 },
    map: openMap(),
    ...overrides,
  };
}

describe('formato de escenario (esquema)', () => {
  it('acepta un escenario válido', () => {
    expect(schema.safeParse(definition()).success).toBe(true);
  });

  it('rechaza ids con mayúsculas, espacios o símbolos', () => {
    expect(schema.safeParse(definition({ id: 'Mi Mapa' })).success).toBe(false);
    expect(schema.safeParse(definition({ id: 'mapa_1' })).success).toBe(false);
  });

  it('exige los colores de la paleta en formato #RRGGBB', () => {
    const palette = { ...definition().palette, wall: 'rojo' };
    const result = schema.safeParse(definition({ palette }));

    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toEqual(['palette', 'wall']);
  });

  it('acepta colores extra en la paleta, pero también los valida', () => {
    const ok = { ...definition().palette, trap: '#ff0000' };
    const bad = { ...definition().palette, trap: 'ff0000' };

    expect(schema.safeParse(definition({ palette: ok })).success).toBe(true);
    expect(schema.safeParse(definition({ palette: bad })).success).toBe(false);
  });

  it('exige las dimensiones y los caracteres del mapa', () => {
    expect(schema.safeParse(definition({ map: openMap().slice(1) })).success).toBe(false);
    expect(
      schema.safeParse(definition({ map: openMap().map((r) => r.slice(1)) })).success
    ).toBe(false);
    expect(schema.safeParse(definition({ map: withCell(openMap(), 5, 5, 'X') })).success).toBe(
      false
    );
  });

  it('exige música con volumen entre 0 y 1 y src nulo o texto', () => {
    expect(
      schema.safeParse(definition({ music: { track: 'a', src: '/a.mp3', volume: 1 } })).success
    ).toBe(true);
    expect(
      schema.safeParse(definition({ music: { track: 'a', src: null, volume: 2 } })).success
    ).toBe(false);
  });
});

describe('validación de jugabilidad del mapa', () => {
  it('un mapa abierto es válido', () => {
    expect(validateMap(openMap())).toEqual([]);
  });

  it('exige borde de muros', () => {
    expect(validateMap(withCell(openMap(), 0, 5, '.'))).toEqual([
      'El borde del mapa debe ser todo de muros (#)',
    ]);
  });

  it('exige reactor rectangular', () => {
    const noReactor = openMap().map((row) => row.replace(/R/g, '.'));
    expect(validateMap(noReactor)).toContain('Falta el reactor (R)');

    const lShaped = withCell(openMap(), 14, 8, '.');
    expect(validateMap(lShaped)[0]).toMatch(/bloque rectangular/);
  });

  it('exige los cuatro inicios una sola vez', () => {
    const missing = withCell(openMap(), 30, 18, '.');
    expect(validateMap(missing)[0]).toMatch(/inicio 2 debe aparecer exactamente una vez/);

    const repeated = withCell(openMap(), 5, 5, '1');
    expect(validateMap(repeated)[0]).toMatch(/inicio 1 debe aparecer exactamente una vez/);
  });

  it('detecta zonas sin conexión (muros que encierran un inicio)', () => {
    let map = openMap();
    // encierra el inicio 4 con un cuadro de muros
    [[1, 16], [2, 16], [3, 16], [3, 17], [3, 18], [3, 19]].forEach(([c, r]) => {
      map = withCell(map, c, r, '#');
    });
    const problems = validateMap(map);

    expect(problems.join(' ')).toMatch(/inicio 4 .* no se conecta/);
  });

  it('un pasillo de 1 celda no cuenta como camino (no cabe el jugador)', () => {
    let map = openMap();
    // muro vertical que parte el mapa en dos, con una sola abertura de 1 celda
    for (let r = 1; r < ROWS - 1; r += 1) map = withCell(map, 8, r, r === 10 ? '.' : '#');

    expect(validateMap(map).join(' ')).toMatch(/no se conecta/);
  });

  it('un pasillo de 2 celdas sí cuenta como camino', () => {
    let map = openMap();
    for (let r = 1; r < ROWS - 1; r += 1) map = withCell(map, 8, r, r === 10 || r === 11 ? '.' : '#');

    expect(validateMap(map)).toEqual([]);
  });

  it('detecta terminales y celdas inalcanzables', () => {
    let map = withCell(openMap(), 5, 5, 'T');
    map = withCell(map, 7, 7, 'C');
    [[4, 4], [5, 4], [6, 4], [4, 5], [6, 5], [4, 6], [5, 6], [6, 6]].forEach(([c, r]) => {
      map = withCell(map, c, r, '#');
    });
    const problems = validateMap(map).join(' ');

    expect(problems).toMatch(/terminal en col 5, fila 5 es inalcanzable/);
  });
});

describe('compileScenario', () => {
  it('convierte el mapa a coordenadas de arena', () => {
    const map = withCell(withCell(openMap(), 5, 5, 'T'), 6, 5, 'C');
    const compiled = compileScenario(definition({ map }), ARENA);

    expect(compiled.cols).toBe(COLS);
    expect(compiled.rows).toBe(ROWS);
    expect(compiled.solid[0][0]).toBe(true);
    expect(compiled.solid[10][15]).toBe(true); // reactor
    expect(compiled.solid[5][5]).toBe(false);
    expect(compiled.reactor).toMatchObject({ col: 14, row: 8, cols: 4, rows: 4, cx: 400, cy: 250 });
    // el inicio es el centro del bloque libre de 2 × 2 que cubre la celda marcada
    expect(compiled.spawns).toEqual([
      { col: 1, row: 1, x: 50, y: 50 },
      { col: 30, row: 18, x: 750, y: 450 },
      { col: 30, row: 1, x: 750, y: 50 },
      { col: 1, row: 18, x: 50, y: 450 },
    ]);
    expect(compiled.terminals).toEqual([{ id: 'terminal-1', col: 5, row: 5, x: 137.5, y: 137.5 }]);
    expect(compiled.cells).toEqual([{ col: 6, row: 5, x: 162.5, y: 137.5 }]);
  });

  it('parseMap cuenta lo que hay en el mapa', () => {
    const parsed = parseMap(withCell(openMap(), 5, 5, 'T'));

    expect(parsed.reactor).toHaveLength(16);
    expect(parsed.terminals).toHaveLength(1);
    expect(Object.keys(parsed.spawns).sort()).toEqual(['1', '2', '3', '4']);
  });
});

describe('ScenarioCatalog', () => {
  const entry = (id, order, name = id) => ({
    definition: { id, order, name },
    compiled: { id },
  });

  it('ordena por order y luego por nombre, y el primero es el por defecto', () => {
    const catalog = new ScenarioCatalog([entry('c', 3), entry('b', 1, 'B'), entry('a', 1, 'A')]);

    expect(catalog.list().map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(catalog.defaultId()).toBe('a');
  });

  it('resolveId: sin dato usa el por defecto; "random" elige uno; un id inexistente falla', () => {
    const catalog = new ScenarioCatalog([entry('a', 1), entry('b', 2), entry('c', 3)]);

    expect(catalog.resolveId(undefined)).toBe('a');
    expect(catalog.resolveId('random', () => 0.99)).toBe('c');
    expect(catalog.resolveId('random', () => 0)).toBe('a');
    expect(catalog.resolveId('b')).toBe('b');
    expect(() => catalog.resolveId('x')).toThrow(
      expect.objectContaining({ status: 400, code: 'SCENARIO_NOT_FOUND' })
    );
  });

  it('un catálogo vacío resuelve a null', () => {
    expect(new ScenarioCatalog([]).resolveId('random')).toBeNull();
  });
});

describe('loadScenarioCatalog', () => {
  let dir;
  let logger;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'escenarios-'));
    logger = { error: jest.fn() };
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const write = (file, content) =>
    fs.writeFileSync(path.join(dir, file), typeof content === 'string' ? content : JSON.stringify(content));

  it('carga los archivos válidos sin cambios de código', () => {
    write('uno.json', definition({ id: 'uno', order: 2 }));
    write('dos.json', definition({ id: 'dos', order: 1 }));

    const catalog = loadScenarioCatalog({ dir, arena: ARENA, logger });

    expect(catalog.list().map((s) => s.id)).toEqual(['dos', 'uno']);
    expect(catalog.getCompiled('uno').spawns).toHaveLength(4);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('rechaza un archivo inválido y registra el error sin afectar a los demás', () => {
    write('bueno.json', definition({ id: 'bueno' }));
    write('roto.json', '{ esto no es json');
    write('sin-reactor.json', definition({ id: 'sin-reactor', map: openMap().map((r) => r.replace(/R/g, '.')) }));
    write('mal-color.json', definition({ id: 'mal-color', palette: { ...definition().palette, floor: 'x' } }));

    const catalog = loadScenarioCatalog({ dir, arena: ARENA, logger });

    expect(catalog.list().map((s) => s.id)).toEqual(['bueno']);
    expect(logger.error).toHaveBeenCalledTimes(3);
    const messages = logger.error.mock.calls.map(([m]) => m).join('\n');
    expect(messages).toMatch(/roto\.json/);
    expect(messages).toMatch(/sin-reactor\.json.*Falta el reactor/);
    expect(messages).toMatch(/mal-color\.json.*palette\.floor/);
  });

  it('rechaza un id repetido', () => {
    write('a.json', definition({ id: 'igual' }));
    write('b.json', definition({ id: 'igual' }));

    const catalog = loadScenarioCatalog({ dir, arena: ARENA, logger });

    expect(catalog.size).toBe(1);
    expect(logger.error.mock.calls[0][0]).toMatch(/ya existe/);
  });

  it('si la carpeta no existe, registra el error y deja el catálogo vacío', () => {
    const catalog = loadScenarioCatalog({ dir: path.join(dir, 'nada'), arena: ARENA, logger });

    expect(catalog.size).toBe(0);
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('escenarios incluidos en el proyecto', () => {
  const logger = { error: jest.fn() };
  const catalog = loadScenarioCatalog({ dir: SHIPPED_DIR, arena: ARENA, logger });

  it('todos son válidos', () => {
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('hay al menos los 4 escenarios del enunciado', () => {
    const names = catalog.list().map((s) => s.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'Laboratorio subterráneo',
        'Estación espacial',
        'Planta industrial',
        'Complejo militar futurista',
      ])
    );
  });

  it('cada uno define muros, reactor, inicios, terminales, celdas, paleta y música', () => {
    catalog.list().forEach((scenario) => {
      const compiled = catalog.getCompiled(scenario.id);

      expect(compiled.solid.flat().some(Boolean)).toBe(true);
      expect(compiled.reactor.cols * compiled.reactor.rows).toBeGreaterThan(0);
      expect(compiled.spawns).toHaveLength(4);
      expect(compiled.terminals.length).toBeGreaterThan(0);
      expect(compiled.cells.length).toBeGreaterThan(0);
      expect(scenario.palette.floor).toMatch(/^#/);
      expect(scenario.music.track.length).toBeGreaterThan(0);
    });
  });

  it('cada escenario es simétrico: los cuatro jugadores empiezan en igualdad', () => {
    catalog.list().forEach((scenario) => {
      const rows = scenario.map;
      const flip = (row) => [...row].reverse().join('');
      const strip = (row) => row.replace(/[1-4]/g, '.');
      const horizontal = rows.map((row) => strip(row));
      const mirroredH = rows.map((row) => strip(flip(row)));
      const mirroredV = [...rows].reverse().map((row) => strip(row));

      expect(mirroredH).toEqual(horizontal);
      expect(mirroredV).toEqual(horizontal);
    });
  });
});
