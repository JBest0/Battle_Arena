// Protocolo del control físico (Arduino) por USB: una línea de texto por lectura.
//   "dx,dy"     dirección (cada eje -1, 0 o 1)
//   "dx,dy,b"   lo mismo y b = 1 mientras el botón de acción está presionado (0 si no)
const LINE = /^(-1|0|1),(-1|0|1)(?:,([01]))?$/;

/** Devuelve { dx, dy, pressed } o null si la línea no es válida. */
export function parseSerialLine(text) {
  const match = LINE.exec(text.trim());
  if (!match) return null;

  return { dx: Number(match[1]), dy: Number(match[2]), pressed: match[3] === '1' };
}

/**
 * Detecta la pulsación del botón: solo el paso de suelto a presionado cuenta como acción;
 * las líneas que repiten "presionado" no generan más. `previous` es el estado anterior.
 */
export function isButtonPress(previous, pressed) {
  return pressed && !previous;
}
