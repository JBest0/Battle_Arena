import client from './client';

export function getMatchResult(matchId) {
  return client
    .get(`/matches/${matchId}/result`)
    .then((response) => response.data);
}
