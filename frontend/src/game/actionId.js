// Identificador único de cada pulsación del botón de acción. El servidor lo usa para no
// contar dos veces una misma pulsación si el mensaje llega repetido (CA-18.8).
let counter = 0;

export function createActionId(random = Math.random, now = Date.now) {
  counter += 1;

  return `${now().toString(36)}-${counter}-${random().toString(36).slice(2, 8)}`;
}
