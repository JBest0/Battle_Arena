import { useCallback, useEffect, useRef, useState } from 'react';
import { toHud } from '../game/arenaState';
import { createMockArena } from '../game/mockArena';

const HUD_INTERVAL_MS = 200;

/*
 * Fuente de estado de la arena con simulación local. Devuelve { stateRef, hud, restart }:
 * - stateRef: lo lee el canvas en cada frame (no provoca renders de React).
 * - hud: copia liviana que sí se renderiza (marcador, reloj, resultado).
 * Para tiempo real, crear un hook con sockets que devuelva lo mismo y usarlo en su lugar.
 */
export function useMockArena(match, arena) {
  const stateRef = useRef(null);
  const [hud, setHud] = useState(null);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    const simulation = createMockArena(match, arena);
    stateRef.current = simulation.state;
    setHud(toHud(simulation.state));

    let last = performance.now();
    let lastHud = last;
    let frame = 0;

    function tick(now) {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      simulation.step(dt);
      const finished = simulation.state.status === 'FINISHED';

      if (finished || now - lastHud >= HUD_INTERVAL_MS) {
        setHud(toHud(simulation.state));
        lastHud = now;
      }

      if (!finished) {
        frame = requestAnimationFrame(tick);
      }
    }

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [match, arena, runId]);

  const restart = useCallback(() => setRunId((value) => value + 1), []);

  return { stateRef, hud, restart };
}
