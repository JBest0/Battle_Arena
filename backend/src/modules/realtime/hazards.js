// Trampas de ralentización y sectores de riesgo (US-20 / RF-032). Se definen en el
// escenario; el motor las aplica a cada jugador según dónde está.

function inside(rect, x, y) {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

// Estado inicial de los efectos de un jugador.
function initialEffects() {
  return { slowUntil: 0, slowFactor: 1, risk: 1, exposure: 1 };
}

// Factor de velocidad actual (1 = normal).
function speedFactor(player, elapsed) {
  return elapsed < player.slowUntil ? player.slowFactor : 1;
}

// Segundos que le quedan al efecto de ralentización (0 si no está ralentizado).
function slowRemaining(player, elapsed) {
  return Math.max(0, player.slowUntil - elapsed);
}

/**
 * Actualiza los efectos de cada jugador según su posición:
 *  - Pisar una trampa lo ralentiza `durationSeconds` desde la última vez que la tocó
 *    (el efecto se renueva mientras siga encima y vence solo al salir).
 *  - Dentro de un sector de riesgo gana su multiplicador de puntos y su exposición; al
 *    salir vuelven a 1.
 */
function applyHazards({ players, traps, riskZones, elapsed }) {
  for (const player of players) {
    player.risk = 1;
    player.exposure = 1;

    for (const zone of riskZones) {
      if (inside(zone, player.x, player.y)) {
        player.risk = Math.max(player.risk, zone.multiplier);
        player.exposure = Math.max(player.exposure, zone.exposure);
      }
    }

    for (const trap of traps) {
      if (inside(trap, player.x, player.y)) {
        const active = elapsed < player.slowUntil;
        player.slowFactor = active ? Math.min(player.slowFactor, trap.slowFactor) : trap.slowFactor;
        player.slowUntil = Math.max(player.slowUntil, elapsed + trap.durationSeconds);
      }
    }
  }
}

module.exports = { initialEffects, speedFactor, slowRemaining, applyHazards };
