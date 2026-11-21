const { rectCells } = require('./rects');

// Segundos que se avisa (parpadeo) antes de que algo se cierre o se mueva.
const WARNING_SECONDS = 0.7;
// Si el movimiento no se puede hacer (hay alguien en el destino o cerraría una ruta), se
// vuelve a intentar a este ritmo.
const RETRY_SECONDS = 0.25;

/**
 * Barrera móvil: un bloque de `cols` × `rows` celdas que salta de una posición de su ruta
 * a la siguiente cada `periodSeconds` (ida y vuelta o en círculo). Bloquea el paso en la
 * posición que ocupa. No se mueve si en el destino hay un jugador o si al moverse dejaría
 * incomunicada alguna zona: espera y vuelve a intentarlo.
 */
class Barrier {
  constructor(definition) {
    this.id = definition.id;
    this.kind = 'barrier';
    this.cols = definition.cols;
    this.rows = definition.rows;
    this.route = definition.route;
    this.pattern = definition.pattern;
    this.periodSeconds = definition.periodSeconds;

    this.index = 0;
    this.direction = 1;
    this.placed = false;
    this.timer = this.periodSeconds;
  }

  cellsAt(index) {
    const [col, row] = this.route[index];

    return rectCells({ col, row, cols: this.cols, rows: this.rows });
  }

  init(engine) {
    this.placed = engine.tryBlocks({ add: this.cellsAt(0) });
    this.timer = this.placed ? this.periodSeconds : RETRY_SECONDS;
  }

  nextIndex() {
    if (this.pattern === 'loop') return { index: (this.index + 1) % this.route.length, direction: 1 };

    let direction = this.direction;
    if (this.index + direction < 0 || this.index + direction >= this.route.length) direction = -direction;

    return { index: this.index + direction, direction };
  }

  update(dt, engine) {
    this.timer -= dt;
    if (this.timer > 0) return;

    if (!this.placed) {
      this.placed = engine.tryBlocks({ add: this.cellsAt(this.index) });
      this.timer = this.placed ? this.periodSeconds : RETRY_SECONDS;
      return;
    }

    const next = this.nextIndex();
    const moved = engine.tryBlocks({
      add: this.cellsAt(next.index),
      remove: this.cellsAt(this.index),
    });

    if (moved) {
      this.index = next.index;
      this.direction = next.direction;
      this.timer = this.periodSeconds;
    } else {
      this.timer = RETRY_SECONDS;
    }
  }

  views() {
    if (!this.placed) return [];

    const [col, row] = this.route[this.index];

    return [
      {
        id: this.id,
        kind: this.kind,
        col,
        row,
        cols: this.cols,
        rows: this.rows,
        closed: true,
        warning: this.timer < WARNING_SECONDS,
      },
    ];
  }
}

module.exports = { Barrier, WARNING_SECONDS, RETRY_SECONDS };
