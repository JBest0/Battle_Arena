const { EventEmitter } = require('events');
const { GameService } = require('../src/modules/game/game.service');
const {
  InMemoryGameRepository,
  inMemoryUnitOfWork,
} = require('./helpers/inMemoryGame');

const NOW = new Date('2026-10-20T15:00:00Z');

function setup() {
  const repository = new InMemoryGameRepository();
  const gameEvents = new EventEmitter();
  const service = new GameService({
    gameRepository: repository,
    unitOfWork: inMemoryUnitOfWork,
    gameEvents,
    clock: () => NOW,
  });
  const host = repository.addUser('anfitrion');
  const guest = repository.addUser('invitado');
  const third = repository.addUser('tercero');

  return { repository, gameEvents, service, host, guest, third };
}

async function newMatch(ctx, overrides = {}) {
  return ctx.service.createMatch(ctx.host.id, {
    endMode: 'TIME',
    maxPlayers: 2,
    ...overrides,
  });
}

describe('GameService.joinMatch', () => {
  it('agrega al jugador a la partida en espera', async () => {
    const ctx = setup();
    const match = await newMatch(ctx);

    const joined = await ctx.service.joinMatch(match.id, ctx.guest.id);

    expect(joined.players.map((p) => p.username)).toEqual([
      'anfitrion',
      'invitado',
    ]);
    expect(joined.status).toBe('WAITING');
  });

  it('es idempotente si el jugador ya estaba dentro', async () => {
    const ctx = setup();
    const match = await newMatch(ctx);

    const again = await ctx.service.joinMatch(match.id, ctx.host.id);

    expect(again.players).toHaveLength(1);
  });

  it('rechaza con MATCH_FULL cuando se llenó el cupo', async () => {
    const ctx = setup();
    const match = await newMatch(ctx, { maxPlayers: 2 });
    await ctx.service.joinMatch(match.id, ctx.guest.id);

    await expect(
      ctx.service.joinMatch(match.id, ctx.third.id)
    ).rejects.toMatchObject({ status: 409, code: 'MATCH_FULL' });
  });

  it('rechaza con MATCH_ALREADY_STARTED si la partida ya comenzó', async () => {
    const ctx = setup();
    const match = await newMatch(ctx, { maxPlayers: 3 });
    await ctx.service.joinMatch(match.id, ctx.guest.id);
    await ctx.service.startMatch(match.id, ctx.host.id);

    await expect(
      ctx.service.joinMatch(match.id, ctx.third.id)
    ).rejects.toMatchObject({ status: 409, code: 'MATCH_ALREADY_STARTED' });
  });

  it('lanza 404 si la partida no existe', async () => {
    const ctx = setup();

    await expect(
      ctx.service.joinMatch('00000000-0000-4000-8000-0000000000ff', ctx.guest.id)
    ).rejects.toMatchObject({ status: 404, code: 'MATCH_NOT_FOUND' });
  });
});

describe('GameService.startMatch', () => {
  it('solo deja iniciar al anfitrión (403 NOT_MATCH_CREATOR)', async () => {
    const ctx = setup();
    const match = await newMatch(ctx);
    await ctx.service.joinMatch(match.id, ctx.guest.id);

    await expect(
      ctx.service.startMatch(match.id, ctx.guest.id)
    ).rejects.toMatchObject({ status: 403, code: 'NOT_MATCH_CREATOR' });
  });

  it('exige el mínimo de jugadores (409 NOT_ENOUGH_PLAYERS)', async () => {
    const ctx = setup();
    const match = await newMatch(ctx);

    await expect(
      ctx.service.startMatch(match.id, ctx.host.id)
    ).rejects.toMatchObject({ status: 409, code: 'NOT_ENOUGH_PLAYERS' });
  });

  it('fija startedAt, pasa a IN_PROGRESS y emite matchStarted una sola vez', async () => {
    const ctx = setup();
    const listener = jest.fn();
    ctx.gameEvents.on('matchStarted', listener);
    const match = await newMatch(ctx);
    await ctx.service.joinMatch(match.id, ctx.guest.id);

    const started = await ctx.service.startMatch(match.id, ctx.host.id);

    expect(started.status).toBe('IN_PROGRESS');
    expect(started.startedAt).toEqual(NOW);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(started);

    await expect(
      ctx.service.startMatch(match.id, ctx.host.id)
    ).rejects.toMatchObject({ status: 409, code: 'MATCH_ALREADY_STARTED' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('no emite matchStarted si el inicio falla', async () => {
    const ctx = setup();
    const listener = jest.fn();
    ctx.gameEvents.on('matchStarted', listener);
    const match = await newMatch(ctx);

    await expect(
      ctx.service.startMatch(match.id, ctx.host.id)
    ).rejects.toBeDefined();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('GameService.listOpenMatches', () => {
  it('lista solo partidas en espera y recientes', async () => {
    const ctx = setup();
    const waiting = await newMatch(ctx);
    const started = await newMatch(ctx);
    await ctx.service.joinMatch(started.id, ctx.guest.id);
    await ctx.service.startMatch(started.id, ctx.host.id);
    const old = await newMatch(ctx);
    ctx.repository.matches.get(old.id).createdAt = new Date(
      NOW.getTime() - 31 * 60 * 1000
    );
    ctx.repository.matches.get(waiting.id).createdAt = NOW;

    const open = await ctx.service.listOpenMatches();

    expect(open.map((m) => m.id)).toEqual([waiting.id]);
  });
});
