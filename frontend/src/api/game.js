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

// Partidas en espera a las que se puede unir -> { matches }
export function listOpenMatches() {
  return client.get('/game/matches').then((response) => response.data);
}

// Entra a una partida en espera -> { match }
export function joinMatch(id) {
  return client.post(`/game/matches/${id}/join`).then((response) => response.data);
}

// Solo el anfitrión: pasa la partida a IN_PROGRESS -> { match }
export function startMatch(id) {
  return client.post(`/game/matches/${id}/start`).then((response) => response.data);
}

export { getErrorMessage };
