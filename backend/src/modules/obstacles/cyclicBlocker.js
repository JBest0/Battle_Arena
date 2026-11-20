const { rectCells } = require('./rects');
const { WARNING_SECONDS, RETRY_SECONDS } = require('./barrier');

/**
 * Base de las puertas y los corredores: un rectángulo de celdas que se alterna entre
 * abierto (se puede pasar) y cerrado (es un muro). Cerrar solo se hace si no hay ningún
 * jugador tocando esas celdas y si no deja ninguna zona incomunicada (si no se puede,
 * sigue abierto y se reintenta); abrir siempre se puede.
 * Las subclases definen cuánto dura abierto (`openDuration`).
 */
class CyclicBlocker {
  constructor(definition, kind) {
    this.id = definition.id;
    this.kind = kind;
    this.rect = {
      col: definition.col,
      row: definition.row,
      cols: definition.cols,
      rows: definition.rows,
    };
    this.cells = rectCells(this.rect);
    this.closedSeconds = definition.closedSeconds;

    this.closed = false;
    this.timer = 0;
  }

  // eslint-disable-next-line class-methods-use-this
  openDuration() {
    throw new Error('Las subclases deben definir openDuration()');
  }

  tryClose(engine) {
    if (!engine.tryBlocks({ add: this.cells })) return false;

    this.closed = true;
    this.timer = this.closedSeconds;

    return true;
  }

  open(engine) {
    engine.tryBlocks({ remove: this.cells });
    this.closed = false;
    this.timer = this.openDuration();
  }

  // Estado inicial: cerrado `closedRemaining` segundos más o abierto `openRemaining`.
  start(engine, { closedRemaining, openRemaining }) {
    if (closedRemaining > 0) {
      if (this.tryClose(engine)) {
        this.timer = closedRemaining;
        return;
      }
      this.timer = RETRY_SECONDS;
      return;
    }

    this.closed = false;
    this.timer = openRemaining;
  }

  update(dt, engine) {
    this.timer -= dt;
    if (this.timer > 0) return;

    if (this.closed) {
      this.open(engine);
    } else if (!this.tryClose(engine)) {
      this.timer = RETRY_SECONDS;
    }
  }

  views() {
    return [
      {
        id: this.id,
        kind: this.kind,
        ...this.rect,
        closed: this.closed,
        // Se avisa antes de cerrar, que es lo que puede sorprender al jugador.
        warning: !this.closed && this.timer < WARNING_SECONDS,
      },
    ];
  }
}

module.exports = { CyclicBlocker };
