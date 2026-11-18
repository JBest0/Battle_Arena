const { SpecialEvent } = require('../specialEvent');

// Puertas que se abren a la vez y grosor máximo de muro que se puede atravesar.
const DOORS = 2;
const MAX_THICKNESS = 2;
// Ancho de la puerta: 2 celdas, lo mínimo para que pase el jugador (radio de choque 16).
const WIDTH = 2;

function isReactorCell(reactor, col, row) {
  return (
    col >= reactor.col &&
    col < reactor.col + reactor.cols &&
    row >= reactor.row &&
    row < reactor.row + reactor.rows
  );
}

/**
 * Huecos posibles: rectángulos de muro de WIDTH celdas de ancho y 1 o 2 de grosor que
 * tienen suelo libre a ambos lados, así que abrirlos comunica dos zonas. Nunca incluyen el
 * borde ni el reactor.
 * @returns {{col: number, row: number, cols: number, rows: number}[]}
 */
function findDoorCandidates({ solid, cols, rows, reactor }) {
  const wall = (col, row) =>
    row > 0 &&
    row < rows - 1 &&
    col > 0 &&
    col < cols - 1 &&
    solid[row][col] &&
    !isReactorCell(reactor, col, row);
  const free = (col, row) => solid[row]?.[col] === false;
  const candidates = [];

  for (let thickness = 1; thickness <= MAX_THICKNESS; thickness += 1) {
    // Muro horizontal: ancho en columnas, grosor en filas.
    for (let row = 1; row + thickness <= rows - 1; row += 1) {
      for (let col = 1; col + WIDTH <= cols - 1; col += 1) {
        let ok = true;
        for (let r = 0; r < thickness && ok; r += 1) {
          for (let c = 0; c < WIDTH && ok; c += 1) ok = wall(col + c, row + r);
        }
        for (let c = 0; c < WIDTH && ok; c += 1) {
          ok = free(col + c, row - 1) && free(col + c, row + thickness);
        }
        if (ok) candidates.push({ col, row, cols: WIDTH, rows: thickness });
      }
    }

    // Muro vertical: ancho en filas, grosor en columnas.
    for (let row = 1; row + WIDTH <= rows - 1; row += 1) {
      for (let col = 1; col + thickness <= cols - 1; col += 1) {
        let ok = true;
        for (let r = 0; r < WIDTH && ok; r += 1) {
          for (let c = 0; c < thickness && ok; c += 1) ok = wall(col + c, row + r);
        }
        for (let r = 0; r < WIDTH && ok; r += 1) {
          ok = free(col - 1, row + r) && free(col + thickness, row + r);
        }
        if (ok) candidates.push({ col, row, cols: thickness, rows: WIDTH });
      }
    }
  }

  return candidates;
}

function touches(a, b) {
  return (
    a.col <= b.col + b.cols &&
    b.col <= a.col + a.cols &&
    a.row <= b.row + b.rows &&
    b.row <= a.row + a.rows
  );
}

function cellsOf(door) {
  const cells = [];
  for (let row = door.row; row < door.row + door.rows; row += 1) {
    for (let col = door.col; col < door.col + door.cols; col += 1) cells.push({ col, row });
  }

  return cells;
}

// Ruta alternativa: se abren huecos temporales en los muros (atajos). Al terminar se
// vuelven a cerrar, pero nunca encima de un jugador: el motor espera a que el hueco quede
// libre (requestWallClose).
class AlternateRouteEvent extends SpecialEvent {
  static canStart(engine) {
    return Boolean(engine.scenario) && findDoorCandidates(engine.wallGrid()).length > 0;
  }

  start(engine) {
    const pool = findDoorCandidates(engine.wallGrid());
    this.doors = [];

    while (this.doors.length < DOORS && pool.length > 0) {
      const [door] = pool.splice(Math.floor(this.random() * pool.length), 1);
      this.doors.push(door);
      for (let i = pool.length - 1; i >= 0; i -= 1) {
        if (touches(pool[i], door)) pool.splice(i, 1);
      }
    }

    this.doors.forEach((door) => cellsOf(door).forEach((c) => engine.openWall(c.col, c.row)));
  }

  end(engine) {
    engine.requestWallClose(this.doors.flatMap(cellsOf));
  }

  params() {
    return { doors: this.doors };
  }
}

AlternateRouteEvent.type = 'alternate-route';
AlternateRouteEvent.label = 'Ruta alternativa';
AlternateRouteEvent.description = 'Se abren atajos temporales en los muros.';
AlternateRouteEvent.accent = '#7bffb0';

module.exports = { AlternateRouteEvent, findDoorCandidates };
