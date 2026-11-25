import { useCallback, useEffect, useRef, useState } from 'react';
import { createGameSocket } from '../api/socket';
import { toHud } from '../game/arenaState';
import { createActionId } from '../game/actionId';

const HUD_INTERVAL_MS = 200;

const CONNECT_ERRORS = {
  EMAIL_NOT_VERIFIED: 'Debes verificar tu correo antes de jugar.',
  TOKEN_EXPIRED_SESSION: 'Tu sesión expiró. Inicia sesión de nuevo.',
  SESSION_REVOKED: 'Tu contraseña cambió. Inicia sesión de nuevo.',
  UNAUTHORIZED: 'Debes iniciar sesión para jugar.',
};

/*
 * Estado de la arena en tiempo real. Devuelve:
 * - stateRef: el último `arena:state`; lo lee el canvas en cada frame (no re-renderiza).
 * - hud: copia liviana para el marcador y el reloj (unas 5 veces por segundo).
 * - connection: 'connecting' | 'connected' | 'reconnecting' | 'error'
 * - sendInput(dx, dy): dirección deseada del jugador (-1..1 por eje).
 * - sendAction(): botón de acción; pide extraer energía del reactor (US-18).
 * - notice: último rechazo del servidor { message, at } (p. ej. "Estás muy lejos del reactor").
 */
export function useArenaSocket(matchId) {
  const stateRef = useRef(null);
  const socketRef = useRef(null);
  const [hud, setHud] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    const socket = createGameSocket();
    socketRef.current = socket;

    let lastHudAt = 0;
    let lastStatus = null;

    function applyState(state, force = false) {
      stateRef.current = state;

      const now = performance.now();
      if (force || state.status !== lastStatus || now - lastHudAt >= HUD_INTERVAL_MS) {
        lastStatus = state.status;
        lastHudAt = now;
        setHud(toHud(state));
      }
    }

    function fail(message) {
      setError(message);
      setConnection('error');
    }

    // Se repite en cada (re)conexión: la sala del socket se pierde al desconectarse.
    socket.on('connect', () => {
      socket.emit('match:join', { matchId }, (response) => {
        if (!response.ok) {
          fail(response.message || 'No se pudo entrar a la partida.');
        } else if (response.status === 'FINISHED') {
          fail('Esta partida ya terminó.');
        } else {
          setError('');
          setConnection('connected');
          if (response.state) applyState(response.state, true);
        }
      });
    });

    socket.on('disconnect', (reason) => {
      if (reason !== 'io client disconnect') setConnection('reconnecting');
    });

    socket.on('connect_error', (err) => {
      fail(CONNECT_ERRORS[err.message] || 'No se pudo conectar con la partida.');
    });

    socket.on('arena:state', (state) => applyState(state));
    socket.on('match:finished', (state) => applyState(state, true));
    socket.on('action:rejected', ({ message }) => setNotice({ message, at: Date.now() }));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [matchId]);

  const sendInput = useCallback((dx, dy) => {
    socketRef.current?.emit('player:input', { dx, dy });
  }, []);

  const sendAction = useCallback(() => {
    socketRef.current?.emit('player:action', { type: 'extract', id: createActionId() });
  }, []);

  const sendDevAction = useCallback((action) =>
    new Promise((resolve) => {
      if (!socketRef.current?.connected) {
        resolve({ ok: false, message: 'El socket no está conectado.' });
        return;
      }
      socketRef.current.emit('dev:action', action, resolve);
    }), []);

  return { stateRef, hud, connection, error, sendInput, sendAction, notice, sendDevAction };
}
