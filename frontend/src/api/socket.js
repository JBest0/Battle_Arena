import { io } from 'socket.io-client';

// Conexión de tiempo real autenticada con el mismo JWT de la sesión. Es del mismo origen
// (el proxy de Vite y nginx reenvían /socket.io al backend).
export function createGameSocket() {
  return io({
    auth: { token: sessionStorage.getItem('token') },
    transports: ['websocket'],
  });
}
