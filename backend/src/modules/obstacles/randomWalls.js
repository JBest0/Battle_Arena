const { rectCells } = require('./rects');
const { seededRandom, deriveSeed } = require('../../shared/seededRandom');

// Cuántas posiciones se prueban en cada cambio antes de rendirse hasta el próximo.
const ATTEMPTS = 12;

/**
 * Paredes que aparecen y desaparecen al azar dentro de las zonas permitidas del escenario.
 * Cada `intervalSeconds` desaparece una pared (más probable cuantas más hay; siempre si se
 * llegó a `maxActive`) o aparece una nueva. Una pared nueva no se coloca
 * encima de nadie ni donde dejaría sin ruta al reactor, a una terminal, a una celda o a un
 * jugador: se prueba otra posición. La secuencia depende solo de la semilla.
 */
class RandomWalls {
  constructor(definition, seed, intervalSeconds) {
    this.id = 'random-walls';
    this.maxActive = definition.maxActive;
    [this.pieceCols, this.pieceRows] = definition.size;
    this.zones = definition.zones;
    this.intervalSeconds = intervalSeconds;
    this.random = seededRandom(deriveSeed(seed, this.id));

    this.walls = [];
    this.nextId = 1;
    this.timer = intervalSeconds;
  }

  // eslint-disable-next-line class-methods-use-this
  init() {}

  // Todas las posiciones (esquina superior izquierda) donde cabe una pared en una zona.
  candidates(engine) {
    const list = [];
    const { reserved } = engine.scenario;

    this.zones.forEach((zone) => {
      for (let row = zone.row; row + this.pieceRows <= zone.row + zone.rows; row += 1) {
        for (let col = zone.col; col + this.pieceCols <= zone.col + zone.cols; col += 1) {
          const cells = rectCells({ col, row, cols: this.pieceCols, rows: this.pieceRows });
          const free = cells.every(
            (cell) => !engine.solid[cell.row][cell.col] && !reserved.has(`${cell.col},${cell.row}`)
          );
          if (free) list.push({ col, row, cells });
        }
      }
    });

    return list;
  }

  addOne(engine) {
    const pool = this.candidates(engine);

    for (let attempt = 0; attempt < ATTEMPTS && pool.length > 0; attempt += 1) {
      const [pick] = pool.splice(Math.floor(this.random() * pool.length), 1);
      if (engine.tryBlocks({ add: pick.cells })) {
        this.walls.push({
          id: `wall-${this.nextId}`,
          col: pick.col,
          row: pick.row,
          cols: this.pieceCols,
          rows: this.pieceRows,
        });
        this.nextId += 1;
        return;
      }
    }
  }

  removeOne(engine) {
    const [wall] = this.walls.splice(Math.floor(this.random() * this.walls.length), 1);
    engine.tryBlocks({ remove: rectCells(wall) });
  }

  // En cada intervalo o desaparece una pared o aparece una: cuantas más hay, más probable
  // es que desaparezca una; en el máximo siempre se retira una.
  change(engine) {
    const remove =
      this.walls.length >= this.maxActive ||
      (this.walls.length > 0 && this.random() < this.walls.length / this.maxActive);

    if (remove) this.removeOne(engine);
    else this.addOne(engine);
  }

  update(dt, engine) {
    this.timer -= dt;
    if (this.timer > 0) return;

    this.timer += this.intervalSeconds;
    this.change(engine);
  }

  views() {
    return this.walls.map((wall) => ({
      id: wall.id,
      kind: 'wall',
      col: wall.col,
      row: wall.row,
      cols: wall.cols,
      rows: wall.rows,
      closed: true,
      warning: false,
    }));
  }
}

module.exports = { RandomWalls };
