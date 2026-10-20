import client, { getErrorMessage } from './client';

// { endModes, limits, defaults, arena }
export function getGameOptions() {
  return client.get('/game/options').then((response) => response.data);
}

// config: { endMode, durationSeconds | targetPoints, maxPlayers } -> { match }
export function createMatch(config) {
  return client.post('/game/matches', config).then((response) => response.data);
}

// -> { match }
export function getMatch(id) {
  return client.get(`/game/matches/${id}`).then((response) => response.data);
}

export { getErrorMessage };
