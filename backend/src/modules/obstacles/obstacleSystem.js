const { Barrier } = require('./barrier');
const { Door } = require('./door');
const { Corridor } = require('./corridor');
const { RandomWalls } = require('./randomWalls');

/**
 * Obstáculos dinámicos de una partida (US-20): barreras móviles, puertas automáticas,
 * corredores que se bloquean y paredes aleatorias. No toca los muros directamente: cada
 * cambio pasa por `engine.tryBlocks`, que se niega si cae sobre un jugador o si dejaría
 * incomunicado el reactor, una terminal, una celda de energía, un inicio o a un jugador.
 * Ni jugadores ni guardianes atraviesan un obstáculo cerrado porque ocupa celdas sólidas.
 */
class ObstacleSystem {
  /**
   * @param {object} options
   * @param {object} options.scenario   escenario compilado (ver scenario.map.js)
   * @param {number} options.seed       semilla de la aleatoriedad (corredores y paredes)
   * @param {number} options.randomWallIntervalSeconds
   */
  constructor({ scenario, seed, randomWallIntervalSeconds }) {
    const { barriers, doors, corridors, randomWalls } = scenario.dynamic;

    this.items = [
      ...barriers.map((definition) => new Barrier(definition)),
      ...doors.map((definition) => new Door(definition)),
      ...corridors.map((definition) => new Corridor(definition, seed)),
      ...(randomWalls ? [new RandomWalls(randomWalls, seed, randomWallIntervalSeconds)] : []),
    ];
  }

  // ¿Este escenario tiene obstáculos dinámicos? (si no, no hace falta crear el sistema)
  static isNeeded(scenario) {
    const { barriers, doors, corridors, randomWalls } = scenario.dynamic;

    return barriers.length + doors.length + corridors.length > 0 || Boolean(randomWalls);
  }

  // ¿Alguno usa números aleatorios? (para no consumir el generador del motor sin necesidad)
  static usesRandom(scenario) {
    const { corridors, randomWalls } = scenario.dynamic;

    return corridors.length > 0 || Boolean(randomWalls);
  }

  init(engine) {
    this.items.forEach((item) => item.init(engine));
  }

  update(dt, engine) {
    this.items.forEach((item) => item.update(dt, engine));
  }

  // Lo que ve el cliente: cada obstáculo con su posición y estado actuales.
  snapshot() {
    return this.items.flatMap((item) => item.views());
  }
}

module.exports = { ObstacleSystem };
