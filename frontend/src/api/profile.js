import client, { getErrorMessage } from '../api/client';

export function getMyProfile() {
  return client.get('/users/me/profile').then((response) => response.data);
}

export function getProfile(id) {
  return client
    .get(`/users/${id}/profile`)
    .then((response) => response.data);
}

export function updateMyProfile(data) {
  return client.patch('/users/me', data).then((response) => response.data);
}

export function getMatchHistory(id, page, pageSize = 10) {
  return client
    .get(`/users/${id}/matches`, { params: { page, pageSize } })
    .then((response) => response.data);
}

export function getRanking(limit = 10) {
  return client
    .get('/ranking', { params: { limit } })
    .then((response) => response.data);
}

export { getErrorMessage };
