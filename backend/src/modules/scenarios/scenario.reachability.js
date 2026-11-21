const { walkableAnchors, anchorsCovering, floodFill } = require('./scenario.map');

// ¿Algún pasillo alcanzable toca el reactor? (un bloque libre de 2 × 2 a una celda de él)
function touchesReactor(anchor, reactor) {
  const lastCol = reactor.col + reactor.cols - 1;
  const lastRow = reactor.row + reactor.rows - 1;

  return (
    anchor.col + 2 >= reactor.col &&
    anchor.col - 1 <= lastCol &&
    anchor.row + 2 >= reactor.row &&
    anchor.row - 1 <= lastRow
  );
}

/**
 * Comprueba que, con los muros de `solid`, todos los `targets` (celdas {col, row}) siguen
 * conectados con el primero por pasillos donde cabe el jugador (bloques libres de 2 × 2) y
 * que ese conjunto llega hasta el reactor. Es la misma regla con la que se valida el mapa
 * al cargarlo; los obstáculos dinámicos la usan para no cerrar nunca todas las rutas.
 *
 * @param {{ solid: boolean[][], cols: number, rows: number,
 *           reactor: {col: number, row: number, cols: number, rows: number},
 *           targets: {col: number, row: number}[] }} grid
 */
function allReachable({ solid, cols, rows, reactor, targets }) {
  if (targets.length === 0) return true;

  const anchors = walkableAnchors({ cols, rows, solid });
  const starts = anchorsCovering(anchors, targets[0].col, targets[0].row);
  if (starts.length === 0) return false;

  const reachable = floodFill(anchors, starts);
  const isReachable = ({ col, row }) =>
    anchorsCovering(anchors, col, row).some((a) => reachable.has(`${a.col},${a.row}`));

  if (!targets.every(isReachable)) return false;

  return [...reachable].some((key) => {
    const [col, row] = key.split(',').map(Number);

    return touchesReactor({ col, row }, reactor);
  });
}

module.exports = { allReachable };
