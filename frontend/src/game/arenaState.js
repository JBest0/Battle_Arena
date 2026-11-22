/*
 * Contrato del estado de la arena. Lo calcula el servidor (backend/src/modules/realtime/
 * arenaEngine.js), llega por el socket y lo dibuja <ArenaCanvas>.
 *
 * ArenaState (evento `arena:state`, ~30 veces por segundo; se guarda en stateRef.current):
 * {
 *   status: 'COUNTDOWN' | 'RUNNING' | 'OVERTIME' | 'FINISHED',
 *   countdown: number,              // segundos que faltan para empezar (COUNTDOWN)
 *   timeRemaining: number | null,   // segundos (modo TIME)
 *   targetPoints: number | null,    // (modo POINTS)
 *   players: [{ id, username, avatarUrl, x, y, score, color,
 *     slow,                        // segundos de ralentización que le quedan (0 = ninguna)
 *     risk,                        // multiplicador del sector de riesgo donde está (1 = fuera)
 *     state,                       // 'normal' | 'frozen' (congelado por un guardián)
 *     frozen }],                   // segundos de congelamiento que le quedan (0 = ninguno)
 *   guardians: [{ id, x, y, extra, targetId }],  // extra: de la invasión; targetId: a quién persigue
 *   items: [{ id, x, y, bonus }],   // bonus: celda extra de un evento (lluvia de energía)
 *   events: [{                      // evento especial activo (a lo sumo uno), [] si no hay
 *     id, type, name, description, accent,   // accent: color #rrggbb
 *     duration, remaining,                   // segundos
 *     params,                                // datos del tipo (p. ej. blackout: { side, region })
 *   }],
 *   openWalls: [[col, fila]],       // muros abiertos por un evento (ruta alternativa)
 *   obstacles: [{ id, kind, col, row, cols, rows, closed, warning }],  // kind: barrier | door |
 *                                   // corridor | wall; warning: está por cerrarse o moverse
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
    overtimeRemaining:
      state.overtimeRemaining === null || state.overtimeRemaining === undefined
        ? null
        : Math.ceil(state.overtimeRemaining),
    elapsed: state.elapsed || 0,
    timeRemaining:
      state.timeRemaining === null ? null : Math.ceil(state.timeRemaining),
    targetPoints: state.targetPoints,
    winnerIds: state.winnerIds,
    events: state.events || [],
    obstacles: state.obstacles || [],
    guardians: (state.guardians || []).length,
    players: state.players.map(({ id, username, avatarUrl, score, color, slow, risk, frozen }) => ({
      id,
      username,
      avatarUrl,
      score,
      color,
      slow: slow || 0,
      risk: risk || 1,
      frozen: frozen || 0,
    })),
  };
}
