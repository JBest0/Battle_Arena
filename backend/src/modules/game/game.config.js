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

// Dimensiones lógicas de la arena (unidades de juego, no píxeles).
const ARENA = {
  width: 800,
  height: 500,
  playerRadius: 24,
  itemRadius: 10,
};

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
  };
}

module.exports = {
  END_MODES,
  GAME_LIMITS,
  MIN_PLAYERS_TO_START,
  OPEN_MATCH_MAX_AGE_MINUTES,
  OPEN_MATCHES_LIMIT,
  DEFAULT_GAME_CONFIG,
  ARENA,
  normalizeConfig,
};
