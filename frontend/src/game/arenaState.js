/*
 * Contrato del estado de la arena. Lo calcula el servidor (backend/src/modules/realtime/
 * arenaEngine.js), llega por el socket y lo dibuja <ArenaCanvas>.
 *
 * ArenaState (evento `arena:state`, ~30 veces por segundo; se guarda en stateRef.current):
 * {
 *   status: 'COUNTDOWN' | 'RUNNING' | 'FINISHED',
 *   countdown: number,              // segundos que faltan para empezar (COUNTDOWN)
 *   timeRemaining: number | null,   // segundos (modo TIME)
 *   targetPoints: number | null,    // (modo POINTS)
 *   players: [{ id, username, avatarUrl, x, y, score, color }],
 *   items: [{ id, x, y }],
 *   winnerIds: string[],            // vacío mientras se juega; varios = empate
 * }
 * Las dimensiones de la arena no viajan en cada estado: vienen de GET /api/game/options.
 *
 * Hud: copia liviana que sí vive en el estado de React (se actualiza unas pocas veces por
 * segundo): ver toHud().
 */

export function toHud(state) {
  return {
    status: state.status,
    countdown: Math.ceil(state.countdown || 0),
    timeRemaining:
      state.timeRemaining === null ? null : Math.ceil(state.timeRemaining),
    targetPoints: state.targetPoints,
    winnerIds: state.winnerIds,
    players: state.players.map(({ id, username, avatarUrl, score, color }) => ({
      id,
      username,
      avatarUrl,
      score,
      color,
    })),
  };
}
