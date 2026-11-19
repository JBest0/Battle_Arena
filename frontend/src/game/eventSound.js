/*
 * Sonido de los eventos especiales. Se sintetiza con la Web Audio API (osciladores), así
 * que no hay archivos de audio ni licencias que documentar. El jugador puede silenciarlo
 * (se recuerda en localStorage).
 */

const STORAGE_KEY = 'arena:sound';

let audioContext = null;

export function isSoundEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // sin almacenamiento: el cambio vale solo para esta sesión de la página
  }
}

function getContext() {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return null;

  if (!audioContext) audioContext = new Context();
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});

  return audioContext;
}

// Cada nota: frecuencia inicial y final (Hz), cuándo empieza y cuánto dura (s).
function note(context, { from, to = from, at = 0, length = 0.2, wave = 'sine', volume = 0.12 }) {
  const start = context.currentTime + at;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.linearRampToValueAtTime(to, start + length);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + length + 0.05);
}

// Un sonido por tipo; los tipos nuevos usan el genérico sin cambiar nada aquí.
const SOUNDS = {
  'reactor-overload': [
    { from: 220, to: 660, length: 0.45, wave: 'sawtooth', volume: 0.09 },
    { from: 660, to: 330, at: 0.45, length: 0.25, wave: 'sawtooth', volume: 0.07 },
  ],
  'energy-rain': [
    { from: 880, to: 1320, length: 0.15 },
    { from: 1100, to: 1650, at: 0.15, length: 0.15 },
    { from: 1320, to: 1980, at: 0.3, length: 0.2 },
  ],
  blackout: [
    { from: 440, to: 110, length: 0.7, wave: 'triangle', volume: 0.14 },
  ],
  'alternate-route': [
    { from: 392, length: 0.14, wave: 'square', volume: 0.06 },
    { from: 523, at: 0.16, length: 0.14, wave: 'square', volume: 0.06 },
    { from: 659, at: 0.32, length: 0.2, wave: 'square', volume: 0.06 },
  ],
};
const GENERIC_SOUND = [
  { from: 520, length: 0.18 },
  { from: 780, at: 0.2, length: 0.25 },
];

export function playEventSound(type) {
  if (!isSoundEnabled()) return;

  try {
    const context = getContext();
    if (!context) return;

    (SOUNDS[type] || GENERIC_SOUND).forEach((spec) => note(context, spec));
  } catch {
    // el sonido es un extra: si el navegador lo bloquea, la partida sigue igual
  }
}
