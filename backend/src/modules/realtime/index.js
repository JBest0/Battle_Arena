const config = require('../../config');
const { GAMEPLAY, ARENA } = require('../game/game.config');
const { createRealtime } = require('./realtime.socket');
const { createDefaultEventFactory } = require('../events/eventFactory');

// Conecta el tiempo real con el resto del backend. Lo llama server.js.
function startRealtime(server) {
  // Se cargan aquí para que las pruebas de createRealtime no necesiten la base de datos.
  const {
    gameService,
    gameEvents,
    statsService,
    scenarioCatalog,
  } = require('../../container');
  const { verifySocketToken } = require('../../shared/middleware/requireAuth');
  const {
    assertSocketUserVerified,
  } = require('../../shared/middleware/requireVerifiedEmail');

  return createRealtime({
    server,
    corsOrigin: config.corsOrigin,
    authenticate: (token) => verifySocketToken(token),
    assertVerified: (user) => assertSocketUserVerified(user),
    gameService,
    gameEvents,
    managerOptions: {
      arena: ARENA,
      rules: {
        ...GAMEPLAY,
        eventIntervalSeconds: config.eventIntervalSeconds,
        eventDurationSeconds: config.eventDurationSeconds,
      },
      // Eventos especiales (US-22): un tipo nuevo se registra en modules/events/types.
      eventFactory: createDefaultEventFactory(),
      getScenario: (id) => scenarioCatalog.getCompiled(id),
      // Guarda puntajes y fecha de fin, y luego estadísticas, ranking y logros (US-16).
      persistResult: async (matchId, result) => {
        await gameService.finishMatch(matchId, result);
        await statsService.recordMatchResult(matchId);
      },
    },
  });
}

module.exports = { startRealtime };
