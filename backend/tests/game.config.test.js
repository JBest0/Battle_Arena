const {
  GAME_LIMITS,
  DEFAULT_GAME_CONFIG,
  normalizeConfig,
} = require('../src/modules/game/game.config');
const {
  gameConfigSchema,
  matchIdParamsSchema,
} = require('../src/modules/game/game.schemas');
const { GameService } = require('../src/modules/game/game.service');

function parse(input) {
  return gameConfigSchema.safeParse(input);
}

function errorFields(result) {
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join('.'), issue.message])
  );
}

describe('normalizeConfig', () => {
  it('modo TIME usa la duración y deja los puntos objetivo en null', () => {
    expect(normalizeConfig({ endMode: 'TIME', durationSeconds: 90 })).toEqual({
      endMode: 'TIME',
      durationSeconds: 90,
      targetPoints: null,
      maxPlayers: DEFAULT_GAME_CONFIG.maxPlayers,
    });
  });

  it('modo POINTS usa los puntos objetivo y deja la duración en null', () => {
    expect(
      normalizeConfig({ endMode: 'POINTS', targetPoints: 25, maxPlayers: 4 })
    ).toEqual({
      endMode: 'POINTS',
      durationSeconds: null,
      targetPoints: 25,
      maxPlayers: 4,
    });
  });

  it('completa con los valores por defecto', () => {
    expect(normalizeConfig({ endMode: 'TIME' })).toEqual({
      endMode: 'TIME',
      durationSeconds: GAME_LIMITS.durationSeconds.default,
      targetPoints: null,
      maxPlayers: GAME_LIMITS.maxPlayers.default,
    });
    expect(normalizeConfig({ endMode: 'POINTS' }).targetPoints).toBe(
      GAME_LIMITS.targetPoints.default
    );
  });
});

describe('gameConfigSchema', () => {
  it('acepta una configuración válida y la normaliza', () => {
    const result = parse({
      endMode: 'POINTS',
      targetPoints: 30,
      durationSeconds: 120,
      maxPlayers: 3,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      endMode: 'POINTS',
      durationSeconds: null,
      targetPoints: 30,
      maxPlayers: 3,
    });
  });

  it('acepta solo endMode y usa los valores por defecto', () => {
    const result = parse({ endMode: 'TIME' });

    expect(result.success).toBe(true);
    expect(result.data.durationSeconds).toBe(180);
    expect(result.data.maxPlayers).toBe(2);
  });

  it('exige un modo de fin válido', () => {
    expect(errorFields(parse({}))).toHaveProperty('endMode');
    expect(errorFields(parse({ endMode: 'OTRO' }))).toEqual({
      endMode: 'El modo de fin debe ser TIME o POINTS',
    });
  });

  it('rechaza valores fuera de rango', () => {
    const fields = errorFields(
      parse({
        endMode: 'TIME',
        durationSeconds: GAME_LIMITS.durationSeconds.max + 1,
        targetPoints: 1,
        maxPlayers: 9,
      })
    );

    expect(fields.durationSeconds).toMatch(/como máximo/);
    expect(fields.targetPoints).toMatch(/al menos/);
    expect(fields.maxPlayers).toMatch(/como máximo/);
  });

  it('rechaza decimales y textos', () => {
    const fields = errorFields(
      parse({ endMode: 'TIME', durationSeconds: 60.5, maxPlayers: '3' })
    );

    expect(fields.durationSeconds).toMatch(/entero/);
    expect(fields.maxPlayers).toMatch(/número/);
  });
});

describe('matchIdParamsSchema', () => {
  it('exige un UUID', () => {
    expect(matchIdParamsSchema.safeParse({ id: 'abc' }).success).toBe(false);
    expect(
      matchIdParamsSchema.safeParse({
        id: '00000000-0000-4000-8000-000000000001',
      }).success
    ).toBe(true);
  });
});

describe('GameService (repositorio simulado)', () => {
  const participant = {
    userId: 'u1',
    finalScore: 0,
    user: { username: 'jugador1', avatar: { url: '/static/avatars/1.png' } },
  };
  const baseMatch = {
    id: 'm1',
    endMode: 'TIME',
    durationSeconds: 180,
    targetPoints: null,
    maxPlayers: 2,
    createdById: 'u1',
    startedAt: null,
    endedAt: null,
    participants: [participant],
  };

  it('getOptions expone modos, límites, defaults y arena', () => {
    const service = new GameService({ gameRepository: {} });
    const options = service.getOptions();

    expect(options.endModes).toEqual(['TIME', 'POINTS']);
    expect(options.limits).toEqual(GAME_LIMITS);
    expect(options.defaults).toEqual(DEFAULT_GAME_CONFIG);
    expect(options.arena.width).toBeGreaterThan(0);
  });

  it('createMatch normaliza la configuración y devuelve la vista pública', async () => {
    const gameRepository = {
      createMatch: jest.fn().mockResolvedValue(baseMatch),
    };
    const service = new GameService({ gameRepository });

    const match = await service.createMatch('u1', { endMode: 'TIME' });

    expect(gameRepository.createMatch).toHaveBeenCalledWith(
      {
        endMode: 'TIME',
        durationSeconds: 180,
        targetPoints: null,
        maxPlayers: 2,
      },
      'u1'
    );
    expect(match).toEqual({
      id: 'm1',
      status: 'WAITING',
      config: {
        endMode: 'TIME',
        durationSeconds: 180,
        targetPoints: null,
        maxPlayers: 2,
      },
      createdById: 'u1',
      startedAt: null,
      endedAt: null,
      players: [
        {
          id: 'u1',
          username: 'jugador1',
          avatarUrl: '/static/avatars/1.png',
          score: 0,
        },
      ],
    });
  });

  it('calcula el estado según startedAt y endedAt', async () => {
    const started = { ...baseMatch, startedAt: new Date() };
    const finished = { ...started, endedAt: new Date() };
    const repo = {
      findMatchWithParticipants: jest
        .fn()
        .mockResolvedValueOnce(started)
        .mockResolvedValueOnce(finished),
    };
    const service = new GameService({ gameRepository: repo });

    expect((await service.getMatch('m1')).status).toBe('IN_PROGRESS');
    expect((await service.getMatch('m1')).status).toBe('FINISHED');
  });

  it('getMatch lanza 404 MATCH_NOT_FOUND si no existe', async () => {
    const service = new GameService({
      gameRepository: {
        findMatchWithParticipants: jest.fn().mockResolvedValue(null),
      },
    });

    await expect(service.getMatch('nada')).rejects.toMatchObject({
      status: 404,
      code: 'MATCH_NOT_FOUND',
    });
  });
});
