const { ARENA, buildMap } = require('./helpers/obstacleScenario');
const { parseMap } = require('../src/modules/scenarios/scenario.map');
const { compileScenario } = require('../src/modules/scenarios/scenario.map');
const { allReachable } = require('../src/modules/scenarios/scenario.reachability');

function grid(options = {}) {
  const scenario = compileScenario({ id: 'x', map: buildMap(options) }, ARENA);
  const solid = scenario.solid.map((row) => [...row]);

  return { scenario, solid };
}
const check = ({ scenario, solid }, extra = []) =>
  allReachable({
    solid,
    cols: scenario.cols,
    rows: scenario.rows,
    reactor: scenario.reactor,
    targets: [...scenario.targets, ...extra],
  });

describe('allReachable', () => {
  it('un mapa abierto está conectado', () => {
    expect(check(grid())).toBe(true);
  });

  it('un muro que parte el mapa en dos lo desconecta', () => {
    const g = grid();
    for (let row = 1; row <= 18; row += 1) {
      g.solid[row][22] = true;
      g.solid[row][23] = true;
    }

    expect(check(g)).toBe(false);
  });

  it('con una abertura de 2 celdas sigue conectado, con 1 celda no (no cabe el jugador)', () => {
    const wide = grid();
    const narrow = grid();
    for (let row = 1; row <= 18; row += 1) {
      [22, 23].forEach((col) => {
        wide.solid[row][col] = row !== 9 && row !== 10;
        narrow.solid[row][col] = row !== 9;
      });
    }

    expect(check(wide)).toBe(true);
    expect(check(narrow)).toBe(false);
  });

  it('exige que cada jugador siga conectado (no queda encerrado en un hueco)', () => {
    const g = grid();
    // un cuarto cerrado de 3 x 3 en una esquina
    for (let row = 12; row <= 16; row += 1) {
      for (let col = 8; col <= 12; col += 1) {
        g.solid[row][col] = row === 12 || row === 16 || col === 8 || col === 12;
      }
    }

    expect(check(g)).toBe(true); // sin nadie dentro no importa
    expect(check(g, [{ col: 10, row: 14 }])).toBe(false);
  });

  it('exige que algún pasillo llegue al reactor', () => {
    const g = grid();
    // el reactor ocupa 14..17 x 8..11: se le rodea de muros a una celda de distancia
    for (let row = 6; row <= 13; row += 1) {
      for (let col = 12; col <= 19; col += 1) {
        const onRing = row === 6 || row === 13 || col === 12 || col === 19;
        if (onRing) g.solid[row][col] = true;
      }
    }

    expect(check(g)).toBe(false);
  });

  it('sin objetivos no hay nada que desconectar', () => {
    const { scenario, solid } = grid();

    expect(
      allReachable({ solid, cols: scenario.cols, rows: scenario.rows, reactor: scenario.reactor, targets: [] })
    ).toBe(true);
    expect(parseMap(buildMap()).cols).toBe(32);
  });
});
