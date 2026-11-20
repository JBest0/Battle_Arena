// Utilidades de celdas compartidas por los obstáculos.

function rectCells({ col, row, cols, rows }) {
  const cells = [];
  for (let r = row; r < row + rows; r += 1) {
    for (let c = col; c < col + cols; c += 1) cells.push({ col: c, row: r });
  }

  return cells;
}

module.exports = { rectCells };
