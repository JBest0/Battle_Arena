const { AppError } = require('../../shared/AppError');
const {
  END_MODES,
  GAME_LIMITS,
  MIN_PLAYERS_TO_START,
  OPEN_MATCH_MAX_AGE_MINUTES,
  OPEN_MATCHES_LIMIT,
  DEFAULT_GAME_CONFIG,
  ARENA,
  normalizeConfig,
} = require('./game.config');

function matchStatus(match) {
  if (match.endedAt) return 'FINISHED';
  if (match.startedAt) return 'IN_PROGRESS';
  return 'WAITING';
}

// Forma pública de una partida: lo que necesitan la sala de juego y la arena.
function toMatchView(match) {
  return {
    id: match.id,
    status: matchStatus(match),
    config: {
      endMode: match.endMode,
      durationSeconds: match.durationSeconds,
      targetPoints: match.targetPoints,
      maxPlayers: match.maxPlayers,
    },
    createdById: match.createdById,
    createdAt: match.createdAt,
    startedAt: match.startedAt,
    endedAt: match.endedAt,
    players: match.participants.map((participant) => ({
      id: participant.userId,
      username: participant.user.username,
      avatarUrl: participant.user.avatar.url,
      score: participant.finalScore,
    })),
  };
}

function matchNotFound() {
  return new AppError(404, 'MATCH_NOT_FOUND', 'La partida no existe');
}

class GameService {
  /**
   * @param {object} deps
   * @param {object} deps.gameRepository
   * @param {object} deps.unitOfWork    ejecuta un bloque dentro de una transacción
   * @param {object} deps.gameEvents    EventEmitter; emite `matchStarted` con la vista de la partida
   * @param {() => Date} [deps.clock]
   */
  constructor({ gameRepository, unitOfWork, gameEvents, clock = () => new Date() }) {
    this.gameRepository = gameRepository;
    this.unitOfWork = unitOfWork;
    this.gameEvents = gameEvents;
    this.clock = clock;
  }

  getOptions() {
    return {
      endModes: END_MODES,
      limits: GAME_LIMITS,
      defaults: DEFAULT_GAME_CONFIG,
      arena: ARENA,
      minPlayersToStart: MIN_PLAYERS_TO_START,
    };
  }

  async createMatch(userId, input) {
    const config = normalizeConfig(input);
    const match = await this.gameRepository.createMatch(config, userId);

    return toMatchView(match);
  }

  async getMatch(matchId) {
    const match = await this.gameRepository.findMatchWithParticipants(matchId);

    if (!match) {
      throw matchNotFound();
    }

    return toMatchView(match);
  }

  // Partidas en espera recientes (incluye las llenas; la vista trae `players` y `config`).
  async listOpenMatches() {
    const since = new Date(
      this.clock().getTime() - OPEN_MATCH_MAX_AGE_MINUTES * 60 * 1000
    );
    const matches = await this.gameRepository.listWaitingMatches(
      since,
      OPEN_MATCHES_LIMIT
    );

    return matches.map(toMatchView);
  }

  // Idempotente: si el jugador ya está en la partida, la devuelve sin error.
  async joinMatch(matchId, userId) {
    return this.unitOfWork.run(async (tx) => {
      await this.gameRepository.lockMatch(matchId, tx);
      const match = await this.gameRepository.findMatchWithParticipants(
        matchId,
        tx
      );

      if (!match) {
        throw matchNotFound();
      }

      if (match.participants.some((p) => p.userId === userId)) {
        return toMatchView(match);
      }

      if (matchStatus(match) !== 'WAITING') {
        throw new AppError(
          409,
          'MATCH_ALREADY_STARTED',
          'La partida ya comenzó'
        );
      }

      if (match.participants.length >= match.maxPlayers) {
        throw new AppError(409, 'MATCH_FULL', 'La partida está llena');
      }

      await this.gameRepository.addParticipant(matchId, userId, tx);

      return toMatchView(
        await this.gameRepository.findMatchWithParticipants(matchId, tx)
      );
    });
  }

  // Solo el anfitrión inicia, y solo con el mínimo de jugadores. Fija `startedAt` y
  // avisa por `gameEvents` (después del commit) para que el módulo de tiempo real arranque.
  async startMatch(matchId, userId) {
    const view = await this.unitOfWork.run(async (tx) => {
      await this.gameRepository.lockMatch(matchId, tx);
      const match = await this.gameRepository.findMatchWithParticipants(
        matchId,
        tx
      );

      if (!match) {
        throw matchNotFound();
      }

      if (match.createdById !== userId) {
        throw new AppError(
          403,
          'NOT_MATCH_CREATOR',
          'Solo quien creó la partida puede iniciarla'
        );
      }

      if (matchStatus(match) !== 'WAITING') {
        throw new AppError(
          409,
          'MATCH_ALREADY_STARTED',
          'La partida ya comenzó'
        );
      }

      if (match.participants.length < MIN_PLAYERS_TO_START) {
        throw new AppError(
          409,
          'NOT_ENOUGH_PLAYERS',
          `Se necesitan al menos ${MIN_PLAYERS_TO_START} jugadores para iniciar`
        );
      }

      await this.gameRepository.markStarted(matchId, this.clock(), tx);

      return toMatchView(
        await this.gameRepository.findMatchWithParticipants(matchId, tx)
      );
    });

    this.gameEvents.emit('matchStarted', view);

    return view;
  }
}

module.exports = { GameService, toMatchView, matchStatus };
