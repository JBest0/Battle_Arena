const { EventEmitter } = require('events');
const { GameService } = require('../src/modules/game/game.service');
const {
  InMemoryGameRepository,
  inMemoryUnitOfWork,
} = require('./helpers/inMemoryGame');

const START = new Date('2026-10-20T15:00:00Z');
const END = new Date('2026-10-20T15:03:00Z');

async function startedMatch() {
  const repository = new InMemoryGameRepository();
  let now = START;
  const service = new GameService({
    gameRepository: repository,
    unitOfWork: inMemoryUnitOfWork,
    gameEvents: new EventEmitter(),
    clock: () => now,
  });
  const host = repository.addUser('anfitrion');
  const guest = repository.addUser('invitado');
  const match = await service.createMatch(host.id, { endMode: 'TIME' });
  await service.joinMatch(match.id, guest.id);
  await service.startMatch(match.id, host.id);
  now = END;

  return { service, repository, host, guest, match };
}

describe('GameService.finishMatch', () => {
  it('guarda puntajes, fecha de fin y ganador', async () => {
    const { service, host, guest, match } = await startedMatch();

    const finished = await service.finishMatch(match.id, {
      scores: { [host.id]: 7, [guest.id]: 4 },
      winnerIds: [host.id],
    });

    expect(finished.status).toBe('FINISHED');
    expect(finished.endedAt).toEqual(END);
    expect(finished.players.find((p) => p.id === host.id).score).toBe(7);
    expect(finished.players.find((p) => p.id === guest.id).score).toBe(4);
  });

  it('deja winnerId en null cuando hay empate', async () => {
    const { service, repository, host, guest, match } = await startedMatch();

    await service.finishMatch(match.id, {
      scores: { [host.id]: 3, [guest.id]: 3 },
      winnerIds: [host.id, guest.id],
    });

    expect(repository.matches.get(match.id).winnerId).toBeNull();
  });

  it('es idempotente: un segundo cierre no cambia el resultado', async () => {
    const { service, host, guest, match } = await startedMatch();
    await service.finishMatch(match.id, {
      scores: { [host.id]: 7, [guest.id]: 4 },
      winnerIds: [host.id],
    });

    const again = await service.finishMatch(match.id, {
      scores: { [host.id]: 0, [guest.id]: 99 },
      winnerIds: [guest.id],
    });

    expect(again.players.find((p) => p.id === guest.id).score).toBe(4);
  });

  it('rechaza cerrar una partida que no comenzó (409 MATCH_NOT_STARTED)', async () => {
    const repository = new InMemoryGameRepository();
    const service = new GameService({
      gameRepository: repository,
      unitOfWork: inMemoryUnitOfWork,
      gameEvents: new EventEmitter(),
    });
    const host = repository.addUser('anfitrion');
    const match = await service.createMatch(host.id, { endMode: 'TIME' });

    await expect(
      service.finishMatch(match.id, { scores: {}, winnerIds: [] })
    ).rejects.toMatchObject({ status: 409, code: 'MATCH_NOT_STARTED' });
  });
});
