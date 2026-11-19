/**
 * Clase base de los eventos especiales (US-22 / RF-036).
 *
 * Un tipo nuevo es una subclase con sus metadatos estáticos; el motor de la arena no la
 * conoce: solo usa esta interfaz a través de EventScheduler. Para agregarlo, se crea el
 * archivo en `types/` y se añade a `types/index.js` (o se registra en la EventFactory).
 *
 * Metadatos estáticos
 *   type         id estable (se guarda en la base de datos y se usa en el cliente)
 *   label        nombre que se anuncia en el HUD
 *   description  una línea que explica el efecto
 *   accent       color (#rrggbb) del anuncio y del efecto visual
 *   weight       probabilidad relativa de salir (por defecto 1)
 *   canStart(engine)  false si el evento no tiene sentido en esa partida
 *
 * Ciclo de vida (lo llama el programador; `engine` es el ArenaEngine)
 *   start(engine)        al comenzar
 *   update(dt, engine)   en cada paso mientras dura
 *   modify(modifiers)    aporta a los modificadores de reglas (p. ej. pointMultiplier)
 *   end(engine)          al terminar: debe dejar la partida como estaba (RN-22)
 *   params()             datos públicos y persistibles (región a oscuras, multiplicador...)
 */
class SpecialEvent {
  /**
   * @param {object} options
   * @param {number} options.durationSeconds
   * @param {() => number} options.random   mismo generador que el motor (pruebas con semilla)
   */
  constructor({ durationSeconds, random }) {
    this.durationSeconds = durationSeconds;
    this.random = random;
  }

  static canStart() {
    return true;
  }

  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  start(engine) {}

  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  update(dt, engine) {}

  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  modify(modifiers) {}

  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  end(engine) {}

  // eslint-disable-next-line class-methods-use-this
  params() {
    return {};
  }
}

SpecialEvent.type = 'special-event';
SpecialEvent.label = 'Evento especial';
SpecialEvent.description = '';
SpecialEvent.accent = '#ffd166';
SpecialEvent.weight = 1;

module.exports = { SpecialEvent };
