// Generador pseudoaleatorio con semilla (mulberry32): misma semilla, misma secuencia.
// Lo usan los obstáculos dinámicos para que una partida (y las pruebas) se puedan repetir.

function seededRandom(seed) {
  let state = seed >>> 0;

  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Mezcla una semilla con un texto (el id de un obstáculo) para darle a cada uno su propia
// secuencia: lo que ocurre con uno no cambia lo que le toca a otro.
function deriveSeed(seed, text) {
  let hash = (seed ^ 0x9e3779b9) >>> 0;
  for (const ch of String(text)) {
    hash = Math.imul(hash ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  }

  return hash >>> 0;
}

module.exports = { seededRandom, deriveSeed };
