const { EventEmitter } = require('events');
const { GameService } = require('../src/modules/game/game.service');
const { InMemoryGameRepository, inMemoryUnitOfWork } = require('./helpers/inMemoryGame');

const EVENTS = [
  {
    id: 'event-1',
    type: 'reactor-overload',
    startedAt: 12.5,
    durationSeconds: 15,
    endedAt: 27.5,
    params: { multiplier: 2 },
  },
  {
    id: 'event-2',
    type: 'blackout',
    startedAt: 60,
    durationSeconds: 15,
    endedAt: 75,
    params: { side: 'left', region: { x: 0, y: 0, width: 400, height: 500 } },
  },
];

async function startedMatch() {
  const repository = new InMemoryGameRepository();
  const service = new GameService({
    gameRepository: repository,
    unitOfWork: inMemoryUnitOfWork,
    gameEvents: new EventEmitter(),
  });
  const host = repository.addUser('anfitrion');
  const guest = repository.addUser('invitado');
  const match = await service.createMatch(host.id, { endMode: 'TIME' });
  await service.joinMatch(match.id, guest.id);
  await service.startMatch(match.id, host.id);

  return { service, repository, host, guest, match };
}

describe('GameService.finishMatch con eventos especiales', () => {
  it('guarda los eventos ocurridos junto con el resultado', async () => {
    const { service, repository, host, guest, match } = await startedMatch();

    await service.finishMatch(match.id, {
      scores: { [host.id]: 6, [guest.id]: 2 },
      winnerIds: [host.id],
      events: EVENTS,
    });

    const saved = repository.matches.get(match.id).events;
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({
      matchId: match.id,
      type: 'reactor-overload',
      startedAt: 12.5,
      durationSeconds: 15,
      endedAt: 27.5,
      params: { multiplier: 2 },
    });
    expect(saved[1].type).toBe('blackout');
  });

  it('sin eventos guarda una lista vacía', async () => {
    const { service, repository, host, guest, match } = await startedMatch();

    await service.finishMatch(match.id, {
      scores: { [host.id]: 1, [guest.id]: 0 },
      winnerIds: [host.id],
    });

    expect(repository.matches.get(match.id).events).toEqual([]);
  });

  it('un segundo cierre no duplica los eventos', async () => {
    const { service, repository, host, guest, match } = await startedMatch();
    const result = {
      scores: { [host.id]: 6, [guest.id]: 2 },
      winnerIds: [host.id],
      events: EVENTS,
    };

    await service.finishMatch(match.id, result);
    await service.finishMatch(match.id, { ...result, events: [EVENTS[0]] });

    expect(repository.matches.get(match.id).events).toHaveLength(2);
  });
});
