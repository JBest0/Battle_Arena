// Lee el mapa de un escenario: valida que sea jugable y lo convierte a la forma que usa
// el motor (celdas sólidas, reactor, puntos de inicio, terminales y celdas de energía).

const DIGITS = ['1', '2', '3', '4'];

function parseMap(map) {
  const rows = map.length;
  const cols = map[0].length;
  const solid = map.map((row) => [...row].map((ch) => ch === '#' || ch === 'R'));
  const found = { reactor: [], spawns: {}, terminals: [], cells: [] };

  map.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === 'R') found.reactor.push({ col: c, row: r });
      if (ch === 'T') found.terminals.push({ col: c, row: r });
      if (ch === 'C') found.cells.push({ col: c, row: r });
      if (DIGITS.includes(ch)) {
        found.spawns[ch] = [...(found.spawns[ch] || []), { col: c, row: r }];
      }
    });
  });

  return { cols, rows, solid, ...found };
}

function reactorRect(reactorCells) {
  const cs = reactorCells.map((c) => c.col);
  const rs = reactorCells.map((c) => c.row);
  const col = Math.min(...cs);
  const row = Math.min(...rs);

  return {
    col,
    row,
    cols: Math.max(...cs) - col + 1,
    rows: Math.max(...rs) - row + 1,
  };
}

// Posiciones donde cabe el jugador: bloques de 2 × 2 celdas libres (50 × 50).
function walkableAnchors({ cols, rows, solid }) {
  const anchors = [];
  for (let r = 0; r < rows - 1; r += 1) {
    anchors.push([]);
    for (let c = 0; c < cols - 1; c += 1) {
      anchors[r].push(
        !solid[r][c] && !solid[r][c + 1] && !solid[r + 1][c] && !solid[r + 1][c + 1]
      );
    }
  }

  return anchors;
}

function anchorsCovering(anchors, col, row) {
  const list = [];
  for (let r = row - 1; r <= row; r += 1) {
    for (let c = col - 1; c <= col; c += 1) {
      if (anchors[r]?.[c]) list.push({ col: c, row: r });
    }
  }

  return list;
}

function floodFill(anchors, starts) {
  const key = (a) => `${a.col},${a.row}`;
  const seen = new Set(starts.map(key));
  const queue = [...starts];

  while (queue.length > 0) {
    const { col, row } = queue.shift();
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dc, dr]) => {
      const next = { col: col + dc, row: row + dr };
      if (anchors[next.row]?.[next.col] && !seen.has(key(next))) {
        seen.add(key(next));
        queue.push(next);
      }
    });
  }

  return seen;
}

function touchesReactor(map, anchor) {
  for (let r = anchor.row - 1; r <= anchor.row + 2; r += 1) {
    for (let c = anchor.col - 1; c <= anchor.col + 2; c += 1) {
      if (map[r]?.[c] === 'R') return true;
    }
  }

  return false;
}

/**
 * Devuelve la lista de problemas del mapa (vacía si es jugable).
 * Una celda es alcanzable si el jugador cabe en algún bloque libre de 2 × 2 que la cubra.
 */
function validateMap(map) {
  const errors = [];
  const parsed = parseMap(map);
  const { cols, rows } = parsed;

  const border =
    map[0] + map[rows - 1] + map.map((row) => row[0] + row[cols - 1]).join('');
  if ([...border].some((ch) => ch !== '#')) {
    errors.push('El borde del mapa debe ser todo de muros (#)');
  }

  if (parsed.reactor.length === 0) {
    errors.push('Falta el reactor (R)');
  } else {
    const rect = reactorRect(parsed.reactor);
    if (
      rect.cols < 2 ||
      rect.rows < 2 ||
      rect.cols * rect.rows !== parsed.reactor.length
    ) {
      errors.push('El reactor (R) debe ser un solo bloque rectangular de al menos 2 × 2');
    }
  }

  DIGITS.forEach((digit) => {
    const count = parsed.spawns[digit]?.length || 0;
    if (count !== 1) {
      errors.push(`El punto de inicio ${digit} debe aparecer exactamente una vez (aparece ${count})`);
    }
  });

  if (errors.length > 0) return errors;

  const anchors = walkableAnchors(parsed);
  const first = parsed.spawns['1'][0];
  const starts = anchorsCovering(anchors, first.col, first.row);
  if (starts.length === 0) {
    return [`El inicio 1 (col ${first.col}, fila ${first.row}) no tiene espacio libre de 2 × 2 celdas`];
  }

  const reachable = floodFill(anchors, starts);
  const isReachable = ({ col, row }) =>
    anchorsCovering(anchors, col, row).some((a) => reachable.has(`${a.col},${a.row}`));

  DIGITS.forEach((digit) => {
    const point = parsed.spawns[digit][0];
    if (!isReachable(point)) {
      errors.push(`El inicio ${digit} (col ${point.col}, fila ${point.row}) no se conecta con el inicio 1`);
    }
  });
  parsed.terminals.forEach((t) => {
    if (!isReachable(t)) errors.push(`La terminal en col ${t.col}, fila ${t.row} es inalcanzable`);
  });
  parsed.cells.forEach((c) => {
    if (!isReachable(c)) errors.push(`La celda de energía en col ${c.col}, fila ${c.row} es inalcanzable`);
  });

  const anchorList = [...reachable].map((k) => {
    const [col, row] = k.split(',').map(Number);
    return { col, row };
  });
  if (!anchorList.some((a) => touchesReactor(map, a))) {
    errors.push('Ningún pasillo llega hasta el reactor');
  }

  return errors;
}

// El jugador sale del centro de un bloque libre de 2 × 2 que cubra la celda marcada,
// para que su círculo de choque no toque ningún muro al empezar.
function spawnPoint(parsed, digit, size) {
  const { col, row } = parsed.spawns[digit][0];
  const anchor = anchorsCovering(walkableAnchors(parsed), col, row)[0];

  return {
    col,
    row,
    x: (anchor.col + 1) * size,
    y: (anchor.row + 1) * size,
  };
}

/** Convierte un escenario válido a la forma que usa el motor (coordenadas en unidades de arena). */
function compileScenario(definition, arena) {
  const parsed = parseMap(definition.map);
  const size = arena.cellSize;
  const center = ({ col, row }) => ({
    col,
    row,
    x: col * size + size / 2,
    y: row * size + size / 2,
  });
  const rect = reactorRect(parsed.reactor);

  return {
    id: definition.id,
    cols: parsed.cols,
    rows: parsed.rows,
    cellSize: size,
    solid: parsed.solid,
    reactor: {
      ...rect,
      x: rect.col * size,
      y: rect.row * size,
      width: rect.cols * size,
      height: rect.rows * size,
      cx: (rect.col + rect.cols / 2) * size,
      cy: (rect.row + rect.rows / 2) * size,
    },
    spawns: DIGITS.map((digit) => spawnPoint(parsed, digit, size)),
    terminals: parsed.terminals.map((t, i) => ({ id: `terminal-${i + 1}`, ...center(t) })),
    cells: parsed.cells.map(center),
  };
}

module.exports = { parseMap, validateMap, compileScenario };
