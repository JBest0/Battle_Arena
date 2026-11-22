// Estados temporales del jugador (US-21): NORMAL y CONGELADO. Los decide solo el servidor;
// el cliente únicamente los dibuja. Todo se mide con el reloj de la partida (`elapsed`), así
// que se prueba sin esperar tiempo real.
//
//  - Congelado: no se mueve ni recoge celdas hasta `frozenUntil`.
//  - Gracia: al descongelarse queda inmune unos segundos (`immuneUntil`) para poder alejarse;
//    en ese lapso los guardianes lo ignoran y buscan a otro jugador. Sin ella, un guardián
//    pegado al jugador lo volvería a congelar de inmediato.

const STATES = { NORMAL: 'normal', FROZEN: 'frozen' };

// Estado inicial de un jugador.
function initialPlayerState() {
  return { frozenUntil: 0, immuneUntil: 0 };
}

function isFrozen(player, elapsed) {
  return elapsed < player.frozenUntil;
}

// Segundos que le quedan de congelamiento (0 si no está congelado).
function freezeRemaining(player, elapsed) {
  return Math.max(0, player.frozenUntil - elapsed);
}

function stateOf(player, elapsed) {
  return isFrozen(player, elapsed) ? STATES.FROZEN : STATES.NORMAL;
}

// ¿Un guardián puede ir tras este jugador y congelarlo? No si está congelado ni en gracia.
function isTargetable(player, elapsed) {
  return elapsed >= player.immuneUntil;
}

/**
 * Congela al jugador `seconds` segundos. Si ya lo estaba, el tiempo se suma al que le queda
 * (no se reinicia). La gracia empieza cuando termina el congelamiento.
 */
function freezePlayer(player, elapsed, seconds, graceSeconds = 0) {
  player.frozenUntil = Math.max(player.frozenUntil, elapsed) + seconds;
  player.immuneUntil = player.frozenUntil + graceSeconds;
}

module.exports = {
  STATES,
  initialPlayerState,
  isFrozen,
  freezeRemaining,
  stateOf,
  isTargetable,
  freezePlayer,
};
