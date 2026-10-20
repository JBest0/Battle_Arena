import { toPlayerView } from './playerView';

/*
 * Contrato del estado de la arena. Lo dibuja <ArenaCanvas> y lo produce una "fuente":
 * hoy useMockArena (simulación local); cuando exista tiempo real (US-10, 11, 13), un
 * hook con sockets que devuelva lo mismo: { stateRef, hud, restart? }.
 *
 * ArenaState (stateRef.current, se muta o reemplaza ~30-60 veces por segundo):
 * {
 *   status: 'RUNNING' | 'FINISHED',
 *   arena: { width, height, playerRadius, itemRadius },  // unidades lógicas
 *   timeRemaining: number | null,   // segundos (modo TIME)
 *   targetPoints: number | null,    // (modo POINTS)
 *   players: [{ id, username, avatarUrl, x, y, score, color }],
 *   items: [{ id, x, y }],
 *   winnerIds: string[],            // vacío mientras se juega; varios = empate
 * }
 *
 * Hud (estado de React, se actualiza unas pocas veces por segundo): ver toHud().
 */

export const PLAYER_COLORS = ['#e63946', '#2a9d8f', '#f4a261', '#7b6cf6'];

export function spawnPoint(index, arena) {
  const margin = 80;
  const points = [
    { x: margin, y: margin },
    { x: arena.width - margin, y: arena.height - margin },
    { x: arena.width - margin, y: margin },
    { x: margin, y: arena.height - margin },
  ];

  return points[index % points.length];
}

export function buildInitialArenaState(match, arena) {
  const { config } = match;

  return {
    status: 'RUNNING',
    arena,
    timeRemaining: config.endMode === 'TIME' ? config.durationSeconds : null,
    targetPoints: config.endMode === 'POINTS' ? config.targetPoints : null,
    players: match.players.map((player, index) => ({
      ...toPlayerView(player),
      ...spawnPoint(index, arena),
      score: player.score || 0,
      color: PLAYER_COLORS[index % PLAYER_COLORS.length],
    })),
    items: [],
    winnerIds: [],
  };
}

// Copia liviana para la interfaz de React (marcador, reloj, resultado).
export function toHud(state) {
  return {
    status: state.status,
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
