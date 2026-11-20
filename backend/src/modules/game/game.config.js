// Fuente única de la configuración del juego y de la arena.
// El frontend la lee con GET /api/game/options; el módulo de tiempo real debe usar
// estas mismas constantes para la física (así cliente y servidor coinciden).

const END_MODES = ['TIME', 'POINTS'];

const GAME_LIMITS = {
  durationSeconds: { min: 30, max: 600, default: 180 },
  targetPoints: { min: 5, max: 200, default: 50 },
  maxPlayers: { min: 2, max: 4, default: 2 },
};

// Mínimo de jugadores para que el anfitrión pueda iniciar la partida.
const MIN_PLAYERS_TO_START = 2;

// Las partidas en espera más viejas que esto ya no se ofrecen en la sala de juego.
const OPEN_MATCH_MAX_AGE_MINUTES = 30;
const OPEN_MATCHES_LIMIT = 20;

const DEFAULT_GAME_CONFIG = {
  endMode: 'TIME',
  durationSeconds: GAME_LIMITS.durationSeconds.default,
  targetPoints: GAME_LIMITS.targetPoints.default,
  maxPlayers: GAME_LIMITS.maxPlayers.default,
};

// Eventos especiales (Anexo B del ERS): tiempo medio entre eventos y duración de cada uno,
// en segundos. Se pueden cambiar con EVENT_INTERVAL_SECONDS y EVENT_DURATION_SECONDS.
const EVENT_LIMITS = {
  intervalSeconds: { min: 15, max: 180, default: 45 },
  durationSeconds: { min: 5, max: 60, default: 15 },
};

// Paredes aleatorias (Anexo B): segundos entre cambios. Se puede cambiar con
// RANDOM_WALL_INTERVAL_SECONDS.
const RANDOM_WALL_LIMITS = { intervalSeconds: { min: 5, max: 60, default: 10 } };

// Reglas de la partida en curso (las usa el motor de tiempo real).
const GAMEPLAY = {
  playerSpeed: 220, // unidades de arena por segundo
  itemsOnField: 4, // ítems simultáneos en la arena
  countdownSeconds: 5, // cuenta regresiva antes de empezar (da tiempo a que todos conecten)
  tickRate: 30, // actualizaciones por segundo
  abandonSeconds: 30, // sin ningún jugador conectado: la partida se cierra
  maxMatchSeconds: 900, // tope de seguridad (sobre todo para el modo por puntos)
  eventIntervalSeconds: EVENT_LIMITS.intervalSeconds.default, // tiempo medio entre eventos
  eventDurationSeconds: EVENT_LIMITS.durationSeconds.default, // duración de cada evento
  randomWallIntervalSeconds: RANDOM_WALL_LIMITS.intervalSeconds.default, // paredes aleatorias
};

// Dimensiones lógicas de la arena (unidades de juego, no píxeles).
const ARENA = {
  width: 800,
  height: 500,
  // Radio con el que se dibuja el personaje (el anillo de color suma 4 más). Con 16, el
  // personaje dibujado mide 40 y cabe con holgura en un pasillo de 2 celdas (50).
  playerRadius: 8,
  itemRadius: 10,
  // Los escenarios son una cuadrícula de cellSize × cellSize (32 × 20 celdas).
  cellSize: 25,
  // Radio con el que el jugador choca contra los muros. Debe cumplir dos cosas a la vez:
  // medir más de media celda (así un hueco de 1 celda no deja pasar, y las puertas de 2
  // celdas bloquean) y caber con holgura en un pasillo de 2 celdas sin trabarse.
  collisionRadius: 8,
};

// Valor de scenarioId para pedir un escenario al azar al crear la partida.
const SCENARIO_RANDOM = 'random';

/**
 * Completa los valores faltantes con los de por defecto y deja en `null` el campo que
 * no aplica al modo: TIME usa `durationSeconds`; POINTS usa `targetPoints`.
 */
function normalizeConfig(input = {}) {
  const endMode = input.endMode || DEFAULT_GAME_CONFIG.endMode;

  return {
    endMode,
    durationSeconds:
      endMode === 'TIME'
        ? input.durationSeconds ?? DEFAULT_GAME_CONFIG.durationSeconds
        : null,
    targetPoints:
      endMode === 'POINTS'
        ? input.targetPoints ?? DEFAULT_GAME_CONFIG.targetPoints
        : null,
    maxPlayers: input.maxPlayers ?? DEFAULT_GAME_CONFIG.maxPlayers,
    // Escenario pedido (id del catálogo o "random"); lo resuelve GameService.
    scenarioId: input.scenarioId,
  };
}

module.exports = {
  END_MODES,
  GAME_LIMITS,
  EVENT_LIMITS,
  RANDOM_WALL_LIMITS,
  MIN_PLAYERS_TO_START,
  OPEN_MATCH_MAX_AGE_MINUTES,
  OPEN_MATCHES_LIMIT,
  DEFAULT_GAME_CONFIG,
  GAMEPLAY,
  ARENA,
  SCENARIO_RANDOM,
  normalizeConfig,
};
