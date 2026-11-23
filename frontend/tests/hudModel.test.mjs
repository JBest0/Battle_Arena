import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rankPlayers,
  pointsPerCell,
  myEffects,
  myStatus,
  isUrgent,
  summarizeObstacles,
  obstacleAlerts,
  scenarioLegend,
  guardianLegend,
  liveText,
} from '../src/game/hudModel.js';
import { toHud } from '../src/game/arenaState.js';

const player = (id, score, extra = {}) => ({ id, username: id, score, slow: 0, risk: 1, ...extra });

test('rankPlayers ordena por puntaje y los empates comparten posición', () => {
  const ranked = rankPlayers([player('a', 3), player('b', 7), player('c', 3), player('d', 0)]);

  assert.deepEqual(
    ranked.map((p) => [p.id, p.rank]),
    [['b', 1], ['a', 2], ['c', 2], ['d', 4]]
  );
});

test('rankPlayers no modifica la lista original', () => {
  const players = [player('a', 1), player('b', 2)];
  rankPlayers(players);

  assert.deepEqual(players.map((p) => p.id), ['a', 'b']);
});

test('pointsPerCell combina el evento activo y el sector de riesgo', () => {
  const overload = { params: { multiplier: 2 } };

  assert.equal(pointsPerCell(player('a', 0)), 1);
  assert.equal(pointsPerCell(player('a', 0, { risk: 3 })), 3);
  assert.equal(pointsPerCell(player('a', 0), [overload]), 2);
  assert.equal(pointsPerCell(player('a', 0, { risk: 3 }), [overload]), 6);
  assert.equal(pointsPerCell(player('a', 0), [{ params: { side: 'left' } }]), 1);
});

test('myEffects lista ralentización, sector y (si se pide) eventos', () => {
  const events = [{ id: 'event-1', name: 'Apagón', remaining: 7.2, accent: '#9d8cff' }];
  const me = player('a', 0, { slow: 1.2, risk: 2 });

  assert.deepEqual(myEffects(me, events), [
    { id: 'slow', label: 'Ralentizado', detail: '2 s', tone: 'bad' },
    { id: 'risk', label: 'Sector de riesgo', detail: 'puntos x2', tone: 'risk' },
  ]);

  const withEvents = myEffects(me, events, { includeEvents: true });
  assert.equal(withEvents.length, 3);
  assert.deepEqual(withEvents[2], {
    id: 'event-1',
    label: 'Apagón',
    detail: '8 s',
    tone: 'event',
    accent: '#9d8cff',
  });
  assert.deepEqual(myEffects(player('a', 0)), []);
});

test('myStatus da la posición, el puntaje y el multiplicador de quien mira', () => {
  const hud = {
    events: [{ id: 'e', name: 'Sobrecarga', remaining: 3, params: { multiplier: 2 } }],
    players: [player('a', 4), player('b', 9, { risk: 2 })],
  };

  assert.deepEqual(
    { ...myStatus(hud, 'a'), me: undefined, effects: undefined },
    { me: undefined, rank: 2, total: 2, score: 4, pointsPerCell: 2, effects: undefined }
  );
  assert.equal(myStatus(hud, 'b').pointsPerCell, 4);
  assert.equal(myStatus(hud, 'nadie'), null);
});

test('isUrgent avisa en los últimos 10 s solo mientras se juega', () => {
  assert.equal(isUrgent({ status: 'RUNNING', timeRemaining: 10 }), true);
  assert.equal(isUrgent({ status: 'RUNNING', timeRemaining: 11 }), false);
  assert.equal(isUrgent({ status: 'COUNTDOWN', timeRemaining: 5 }), false);
  assert.equal(isUrgent({ status: 'RUNNING', timeRemaining: null }), false);
});

test('summarizeObstacles cuenta cada tipo y cuántos están cerrados', () => {
  const summary = summarizeObstacles([
    { kind: 'door', closed: true },
    { kind: 'door', closed: false },
    { kind: 'door', closed: true },
    { kind: 'barrier', closed: true },
    { kind: 'wall', closed: true },
  ]);

  assert.deepEqual(summary.door, { total: 3, closed: 2 });
  assert.deepEqual(summary.barrier, { total: 1, closed: 1 });
  assert.deepEqual(summary.corridor, { total: 0, closed: 0 });
  assert.deepEqual(summary.wall, { total: 1, closed: 1 });
});

test('obstacleAlerts avisa de lo que está por cerrarse o moverse', () => {
  assert.deepEqual(obstacleAlerts([{ kind: 'door', warning: false }]), []);
  assert.deepEqual(obstacleAlerts([{ kind: 'door', warning: true }]), ['Se va a cerrar una puerta']);
  assert.deepEqual(obstacleAlerts([{ kind: 'corridor', warning: true }]), ['Se va a cerrar un corredor']);
  assert.deepEqual(
    obstacleAlerts([
      { kind: 'door', warning: true },
      { kind: 'corridor', warning: true },
      { kind: 'barrier', warning: true },
      { kind: 'barrier', warning: true },
    ]),
    ['Se van a cerrar 2 pasos', '2 barreras están por moverse']
  );
});

test('scenarioLegend solo muestra lo que trae el escenario', () => {
  assert.deepEqual(scenarioLegend(null), []);
  assert.deepEqual(scenarioLegend({}), []);

  const legend = scenarioLegend({
    traps: [{ slowFactor: 0.45 }, { slowFactor: 0.4 }],
    riskZones: [{ multiplier: 2 }, { multiplier: 3 }],
    obstacles: { doors: [{}], corridors: [], barriers: [{}] },
    randomWalls: { maxActive: 2 },
  });

  assert.deepEqual(
    legend.map((entry) => entry.id),
    ['trap', 'riskZone', 'door', 'barrier', 'wall']
  );
  assert.match(legend[0].hint, /40 %/);
  assert.match(legend[1].hint, /x3/);
});

test('liveText arma el conteo en vivo de cada entrada', () => {
  const summary = summarizeObstacles([
    { kind: 'door', closed: true },
    { kind: 'door', closed: false },
    { kind: 'wall', closed: true },
    { kind: 'barrier', closed: true },
  ]);

  assert.equal(liveText({ live: 'door' }, summary), '1 de 2 cerradas');
  assert.equal(liveText({ live: 'wall' }, summary), '1 pared ahora');
  assert.equal(liveText({ live: 'barrier' }, summary), '1 en movimiento');
  assert.equal(liveText({ id: 'trap' }, summary), '');
});

test('toHud conserva los efectos de cada jugador y los obstáculos', () => {
  const hud = toHud({
    status: 'RUNNING',
    countdown: 0,
    timeRemaining: 41.2,
    targetPoints: null,
    winnerIds: [],
    obstacles: [{ id: 'p', kind: 'door' }],
    players: [
      { id: 'a', username: 'ana', avatarUrl: '/a.png', score: 2, color: '#f00', x: 1, y: 2, slow: 1.5, risk: 3 },
      { id: 'b', username: 'beto', avatarUrl: '/b.png', score: 0, color: '#0f0', x: 3, y: 4 },
    ],
  });

  assert.equal(hud.timeRemaining, 42);
  assert.deepEqual(hud.players[0], {
    id: 'a', username: 'ana', avatarUrl: '/a.png', score: 2, color: '#f00', slow: 1.5, risk: 3, frozen: 0,
  });
  assert.equal(hud.players[1].slow, 0);
  assert.equal(hud.players[1].risk, 1);
  assert.equal(hud.obstacles.length, 1);
  assert.equal(hud.guardians, 0);
  assert.equal(toHud({ status: 'RUNNING', players: [], winnerIds: [], guardians: [{}, {}] }).guardians, 2);
  assert.deepEqual(toHud({ status: 'RUNNING', players: [], winnerIds: [], timeRemaining: null }).obstacles, []);
});

test('myEffects muestra "Congelado" con los segundos que quedan, antes que lo demás', () => {
  const me = player('a', 0, { frozen: 2.1, slow: 1 });
  const [first, second] = myEffects(me);

  assert.deepEqual(first, { id: 'frozen', label: 'Congelado', detail: '3 s', tone: 'frozen' });
  assert.equal(second.id, 'slow');
  assert.deepEqual(myEffects(player('a', 0, { frozen: 0 })), []);
});

test('guardianLegend solo aparece si hay guardianes en la partida', () => {
  assert.equal(guardianLegend(0), null);
  assert.equal(guardianLegend(undefined), null);

  const entry = guardianLegend(4);
  assert.equal(entry.id, 'guardian');
  assert.match(entry.live, /4/);
});

test('toHud conserva prórroga y duración', () => {
  const hud = toHud({
    status: 'OVERTIME',
    overtimeRemaining: 5.2,
    elapsed: 300,
    countdown: 0,
    timeRemaining: 0,
    targetPoints: null,
    winnerIds: [],
    players: [],
  });

  assert.equal(hud.status, 'OVERTIME');
  assert.equal(hud.overtimeRemaining, 6);
  assert.equal(hud.elapsed, 300);
  assert.equal(isUrgent(hud), true);
});
