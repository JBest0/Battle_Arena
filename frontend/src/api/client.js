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

const SESSION_ERROR_CODES = ['UNAUTHORIZED', 'TOKEN_EXPIRED_SESSION'];

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const data = error.response?.data?.error;
    const url = error.config?.url || '';
    const isLoginRequest = url.includes('/auth/login');

    if (
      status === 401 &&
      SESSION_ERROR_CODES.includes(data?.code) &&
      !isLoginRequest
    ) {
      sessionStorage.removeItem('token');
      window.dispatchEvent(
        new CustomEvent('auth:expired', { detail: data.message })
      );
    }

    return Promise.reject(error);
  }
);

export function getErrorMessage(err) {
  return (
    err?.response?.data?.error?.message ||
    'Ocurrió un error inesperado. Intente de nuevo.'
  );
}

export default client;
