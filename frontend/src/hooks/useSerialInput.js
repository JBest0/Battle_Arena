import { useCallback, useEffect, useRef, useState } from 'react';
import { isButtonPress, parseSerialLine } from '../game/serialProtocol';

const BAUD_RATE = 115200; // debe coincidir con Serial.begin() del Arduino

/*
 * Control físico (Arduino Mega 2560) por USB usando la Web Serial API.
 * Lee líneas "dx,dy" (o "dx,dy,b" con el botón de acción) y las reenvía con el mismo
 * sendInput que usa el teclado. Cada pulsación del botón (paso de 0 a 1) es UNA acción: las
 * líneas que repiten b = 1 mientras sigue presionado no generan más acciones.
 *
 * Devuelve:
 * - supported: el navegador soporta Web Serial (Chrome / Edge, con HTTPS o localhost)
 * - status: 'idle' | 'connecting' | 'connected' | 'error'
 * - error: mensaje de error legible
 * - connect(): abre el selector de puerto (debe llamarse desde un clic)
 * - disconnect(): cierra el puerto
 *
 * Si ya diste permiso antes, se reconecta solo al entrar a la arena.
 */
export function useSerialInput(sendInput, enabled, onAction = null) {
  const supported = typeof navigator !== 'undefined' && 'serial' in navigator;
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const sendRef = useRef(sendInput);
  const actionRef = useRef(onAction);
  const pressedRef = useRef(false);
  const enabledRef = useRef(enabled);
  const lastRef = useRef([0, 0]);
  const readerRef = useRef(null);
  const queueRef = useRef(Promise.resolve());
  const aliveRef = useRef(true);

  sendRef.current = sendInput;
  actionRef.current = onAction;
  enabledRef.current = enabled;

  // Si el control ya tenía una dirección apretada cuando empieza la partida, se envía.
  useEffect(() => {
    if (enabled) sendRef.current(lastRef.current[0], lastRef.current[1]);
  }, [enabled]);

  const run = useCallback(async (port) => {
    setError('');
    setStatus('connecting');

    try {
      await port.open({ baudRate: BAUD_RATE });
    } catch {
      setStatus('error');
      setError('No se pudo abrir el puerto. ¿Está abierto el Monitor Serie del IDE de Arduino?');
      return;
    }

    if (!aliveRef.current) {
      await port.close().catch(() => {});
      return;
    }

    setStatus('connected');
    let failed = false;

    try {
      const decoder = new TextDecoder();
      const reader = port.readable.getReader();
      readerRef.current = reader;
      let buffer = '';

      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          if (buffer.length > 200) buffer = ''; // basura sin saltos de línea

          let index;
          while ((index = buffer.indexOf('\n')) >= 0) {
            const parsed = parseSerialLine(buffer.slice(0, index));
            buffer = buffer.slice(index + 1);
            if (!parsed) continue;

            const { dx, dy, pressed } = parsed;
            lastRef.current = [dx, dy];

            if (isButtonPress(pressedRef.current, pressed) && enabledRef.current) {
              actionRef.current?.();
            }
            pressedRef.current = pressed;

            if (enabledRef.current) sendRef.current(dx, dy);
          }
        }
      } finally {
        reader.releaseLock();
        readerRef.current = null;
      }
    } catch {
      failed = true; // cable desconectado o error de lectura
    }

    await port.close().catch(() => {});
    lastRef.current = [0, 0];
    pressedRef.current = false;
    sendRef.current(0, 0);

    if (failed && aliveRef.current) {
      setStatus('error');
      setError('Se perdió la conexión con el control.');
    } else {
      setStatus('idle');
    }
  }, []);

  // Las aperturas se encolan para no pisarse (p. ej. React StrictMode en desarrollo).
  const start = useCallback(
    (port) => {
      queueRef.current = queueRef.current.then(() => run(port));
    },
    [run],
  );

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      readerRef.current?.cancel().catch(() => {});
    };
  }, []);

  // Reconexión automática a un puerto autorizado anteriormente.
  useEffect(() => {
    if (!supported) return undefined;

    let cancelled = false;
    navigator.serial.getPorts().then((ports) => {
      if (!cancelled && ports.length > 0) start(ports[0]);
    });

    return () => {
      cancelled = true;
    };
  }, [supported, start]);

  const connect = useCallback(async () => {
    if (!supported) return;
    try {
      const port = await navigator.serial.requestPort();
      start(port);
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        setStatus('error');
        setError('No se pudo seleccionar el puerto.');
      }
    }
  }, [supported, start]);

  const disconnect = useCallback(() => {
    readerRef.current?.cancel().catch(() => {});
  }, []);

  return { supported, status, error, connect, disconnect };
}