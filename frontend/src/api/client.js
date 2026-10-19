import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
});

client.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function getErrorMessage(err) {
  return (
    err?.response?.data?.error?.message ||
    'Ocurrió un error inesperado. Intente de nuevo.'
  );
}

export default client;
