// Escenario de prueba con obstáculos: borde, reactor al centro, cuatro inicios y secciones
// opcionales a gusto de cada prueba. Todo es piso salvo lo que se indique.
const { ARENA, GAMEPLAY } = require('../../src/modules/game/game.config');
const { compileScenario } = require('../../src/modules/scenarios/scenario.map');
const { ArenaEngine } = require('../../src/modules/realtime/arenaEngine');

const COLS = ARENA.width / ARENA.cellSize; // 32
const ROWS = ARENA.height / ARENA.cellSize; // 20

function buildMap({ walls = [], cells = [], terminals = [] } = {}) {
  const rows = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) =>
      r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1 ? '#' : '.'
    )
  );
  for (let r = 8; r <= 11; r += 1) for (let c = 14; c <= 17; c += 1) rows[r][c] = 'R';
  walls.forEach(([c, r]) => {
    rows[r][c] = '#';
  });
  cells.forEach(([c, r]) => {
    rows[r][c] = 'C';
  });
  terminals.forEach(([c, r]) => {
    rows[r][c] = 'T';
  });
  rows[2][2] = '1';
  rows[17][29] = '2';
  rows[2][29] = '3';
  rows[17][2] = '4';

  return rows.map((row) => row.join(''));
}

function scenarioWith({ map = {}, ...sections } = {}) {
  const definition = {
    id: 'prueba',
    map: buildMap(map),
    obstacles: {},
    traps: [],
    riskZones: [],
    randomWalls: null,
    ...sections,
  };

  return compileScenario(definition, ARENA);
}

const RULES = {
  ...GAMEPLAY,
  itemsOnField: 3,
  countdownSeconds: 1,
  randomWallIntervalSeconds: 10,
};
const CONFIG = { endMode: 'TIME', durationSeconds: 3000, targetPoints: null };
const PLAYERS = [
  { id: 'a', username: 'ana', avatarUrl: '/a.png' },
  { id: 'b', username: 'beto', avatarUrl: '/b.png' },
];

function createEngine({ scenario, rules = {}, seed = 1234, random = () => 0.5, eventFactory = null } = {}) {
  return new ArenaEngine({
    config: CONFIG,
    arena: ARENA,
    rules: { ...RULES, ...rules },
    players: PLAYERS,
    random,
    scenario,
    eventFactory,
    obstacleSeed: seed,
  });
}

// Avanza `seconds` en pasos de 0,1 s (y sale de la cuenta regresiva si hace falta).
function run(engine, seconds) {
  for (let t = 0; t < seconds - 1e-9; t += 0.1) engine.step(0.1);
}

// Sale de la cuenta regresiva.
function startMatch(engine) {
  run(engine, RULES.countdownSeconds + 0.1);
}

// Pone a un jugador en el centro de una celda.
function placePlayer(engine, id, col, row) {
  const player = engine.players.find((candidate) => candidate.id === id);
  player.x = col * ARENA.cellSize + ARENA.cellSize / 2;
  player.y = row * ARENA.cellSize + ARENA.cellSize / 2;

  return player;
}

module.exports = {
  ARENA,
  COLS,
  ROWS,
  RULES,
  PLAYERS,
  buildMap,
  scenarioWith,
  createEngine,
  run,
  startMatch,
  placePlayer,
};
