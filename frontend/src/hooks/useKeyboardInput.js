import { useEffect } from 'react';

const DIRECTIONS = {
  ArrowUp: [0, -1],
  w: [0, -1],
  ArrowDown: [0, 1],
  s: [0, 1],
  ArrowLeft: [-1, 0],
  a: [-1, 0],
  ArrowRight: [1, 0],
  d: [1, 0],
};

function normalizeKey(key) {
  return key.length === 1 ? key.toLowerCase() : key;
}

// Teclado (WASD o flechas) como control mientras no exista el control físico ESP32
// (US-12, 14). Solo envía cuando cambia la dirección y suelta al perder el foco.
export function useKeyboardInput(sendInput, enabled) {
  useEffect(() => {
    if (!enabled) return undefined;

    const pressed = new Set();
    let last = '0,0';

    function emit() {
      let dx = 0;
      let dy = 0;
      pressed.forEach((key) => {
        dx += DIRECTIONS[key][0];
        dy += DIRECTIONS[key][1];
      });

      const signature = `${dx},${dy}`;
      if (signature !== last) {
        last = signature;
        sendInput(dx, dy);
      }
    }

    function onKeyDown(event) {
      const key = normalizeKey(event.key);
      if (!(key in DIRECTIONS)) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;

      event.preventDefault();
      pressed.add(key);
      emit();
    }

    function onKeyUp(event) {
      pressed.delete(normalizeKey(event.key));
      emit();
    }

    function onBlur() {
      pressed.clear();
      emit();
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      pressed.clear();
      if (last !== '0,0') sendInput(0, 0);
    };
  }, [sendInput, enabled]);
}
