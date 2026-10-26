const { Server } = require('socket.io');
const { MatchRoomManager } = require('./matchRoomManager');

const roomName = (matchId) => `match:${matchId}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failure(code, message) {
  return { ok: false, code, message };
}

/**
 * Servidor de WebSockets de la arena.
 *
 * Cliente -> servidor
 *   `match:join`   { matchId }  con ack { ok, status, state? } | { ok: false, code, message }
 *   `player:input` { dx, dy }   dirección deseada (-1..1 por eje)
 * Servidor -> cliente
 *   `arena:state`     estado de la arena (ver ArenaEngine.snapshot)
 *   `match:finished`  estado final, después de guardar el resultado
 *
 * @param {object} options
 * @param {import('http').Server} options.server
 * @param {string|string[]} [options.corsOrigin]
 * @param {(token: string) => Promise<{id: string, username: string}>} options.authenticate
 * @param {(user: object) => Promise<object>} options.assertVerified
 * @param {{ getMatch: (matchId: string) => Promise<object> }} options.gameService
 * @param {import('events').EventEmitter} [options.gameEvents]  escucha `matchStarted`
 * @param {{arena: object, rules: object, persistResult: Function}} options.managerOptions
 */
function createRealtime({
  server,
  corsOrigin,
  authenticate,
  assertVerified,
  gameService,
  gameEvents,
  managerOptions,
}) {
  const io = new Server(server, { cors: { origin: corsOrigin } });
  const manager = new MatchRoomManager({
    ...managerOptions,
    emit: (matchId, event, payload) => io.to(roomName(matchId)).emit(event, payload),
  });

  if (gameEvents) {
    gameEvents.on('matchStarted', (match) => manager.startMatch(match));
  }

  // Misma verificación que HTTP: JWT vigente y correo verificado (CA-02.5).
  io.use(async (socket, next) => {
    try {
      const user = await authenticate(socket.handshake.auth?.token);
      await assertVerified(user);
      socket.user = user;
      return next();
    } catch (err) {
      return next(new Error(err.code || 'UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('match:join', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const matchId = payload?.matchId;

      if (typeof matchId !== 'string' || !UUID.test(matchId)) {
        return reply(failure('VALIDATION_ERROR', 'Partida inválida'));
      }

      if (socket.data.matchId) {
        return reply(failure('ALREADY_JOINED', 'Ya estás conectado a una partida'));
      }

      try {
        const match = await gameService.getMatch(matchId);

        if (!match.players.some((player) => player.id === socket.user.id)) {
          return reply(failure('NOT_A_PLAYER', 'No participas en esta partida'));
        }

        if (match.status === 'IN_PROGRESS' && !manager.isActive(matchId)) {
          return reply(failure('MATCH_NOT_ACTIVE', 'La partida ya no está activa'));
        }

        socket.data.matchId = matchId;
        socket.join(roomName(matchId));
        manager.socketJoined(matchId);

        return reply({
          ok: true,
          status: match.status,
          state: manager.snapshot(matchId),
        });
      } catch (err) {
        return reply(failure(err.code || 'INTERNAL_ERROR', err.message));
      }
    });

    socket.on('player:input', (payload) => {
      const { matchId } = socket.data;
      if (!matchId) return;

      manager.setInput(matchId, socket.user.id, Number(payload?.dx), Number(payload?.dy));
    });

    socket.on('disconnect', () => {
      const { matchId } = socket.data;
      if (!matchId) return;

      manager.setInput(matchId, socket.user.id, 0, 0);
      manager.socketLeft(matchId);
    });
  });

  return {
    io,
    manager,
    close: () =>
      new Promise((resolve) => {
        manager.stopAll();
        io.close(() => resolve());
      }),
  };
}

module.exports = { createRealtime, roomName };
