// Rutas de los guardianes. Usan la misma idea que la validación del mapa (scenario.map):
// un "ancla" (col, fila) es un bloque libre de 2 × 2 celdas, donde cabe el círculo de choque
// de un jugador o de un guardián; su centro es ((col + 1) * celda, (fila + 1) * celda). Dos
// anclas vecinas se conectan en línea recta sin tocar muros. Se calcula sobre `engine.solid`,
// que ya incluye los obstáculos dinámicos, así que las rutas rodean puertas y paredes
// cerradas en el momento de calcularlas.

const { walkableAnchors, anchorsCovering } = require('../scenarios/scenario.map');

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Cuadrícula de anclas libres del estado actual de la arena. */
function buildGrid(engine) {
  const { cols, rows, cellSize } = engine.scenario;

  return {
    anchors: walkableAnchors({ cols, rows, solid: engine.solid }),
    width: cols - 1,
    height: rows - 1,
    size: cellSize,
  };
}

function centerOf(grid, anchor) {
  return { x: (anchor.col + 1) * grid.size, y: (anchor.row + 1) * grid.size };
}

function indexOf(grid, anchor) {
  return anchor.row * grid.width + anchor.col;
}

/** Todas las anclas libres, con su centro. */
function freeAnchors(grid) {
  const list = [];
  for (let row = 0; row < grid.height; row += 1) {
    for (let col = 0; col < grid.width; col += 1) {
      if (grid.anchors[row]?.[col]) list.push({ col, row });
    }
  }

  return list;
}

/** Ancla libre cuyo centro queda más cerca de (x, y); `null` si no hay ninguna. */
function nearestAnchor(grid, x, y, candidates = null) {
  let list = candidates;
  if (!list) {
    list = anchorsCovering(
      grid.anchors,
      Math.floor(x / grid.size),
      Math.floor(y / grid.size)
    );
    // Fuera de todo bloque libre (p. ej. pegado a un muro): se busca en toda la arena.
    if (list.length === 0) list = freeAnchors(grid);
  }

  let best = null;
  let bestDistance = Infinity;
  for (const anchor of list) {
    const center = centerOf(grid, anchor);
    const distance = Math.hypot(center.x - x, center.y - y);
    if (distance < bestDistance) {
      best = anchor;
      bestDistance = distance;
    }
  }

  return best;
}

/**
 * Recorrido en anchura desde `start`. Devuelve, por ancla, su distancia en pasos (-1 si no
 * se llega) y la ancla anterior del camino más corto.
 */
function bfs(grid, start) {
  const total = grid.width * grid.height;
  const dist = new Int32Array(total).fill(-1);
  const prev = new Int32Array(total).fill(-1);
  const queue = [start];
  dist[indexOf(grid, start)] = 0;

  for (let head = 0; head < queue.length; head += 1) {
    const { col, row } = queue[head];
    const here = dist[indexOf(grid, queue[head])];

    for (const [dc, dr] of NEIGHBORS) {
      const next = { col: col + dc, row: row + dr };
      if (grid.anchors[next.row]?.[next.col] && dist[indexOf(grid, next)] === -1) {
        dist[indexOf(grid, next)] = here + 1;
        prev[indexOf(grid, next)] = indexOf(grid, queue[head]);
        queue.push(next);
      }
    }
  }

  return { dist, prev };
}

/** Anclas del camino de `start` (primera) a `goal` (última), a partir de un `bfs`. */
function pathTo(grid, search, goal) {
  const path = [];
  let index = indexOf(grid, goal);

  while (index !== -1) {
    path.push({ col: index % grid.width, row: Math.floor(index / grid.width) });
    index = search.prev[index];
  }

  return path.reverse();
}

/**
 * Ancla alcanzable (según `search`) más cercana a (x, y): la que sirve de destino para llegar
 * a un jugador. `null` si el jugador no es alcanzable desde donde se hizo el recorrido.
 */
function bestAnchorFor(grid, search, x, y) {
  const isReachable = (anchor) => search.dist[indexOf(grid, anchor)] >= 0;
  let candidates = anchorsCovering(
    grid.anchors,
    Math.floor(x / grid.size),
    Math.floor(y / grid.size)
  ).filter(isReachable);

  // Fuera de todo bloque libre: se toma la ancla alcanzable más cercana de toda la arena.
  if (candidates.length === 0) candidates = freeAnchors(grid).filter(isReachable);

  return nearestAnchor(grid, x, y, candidates);
}

module.exports = {
  buildGrid,
  centerOf,
  indexOf,
  freeAnchors,
  nearestAnchor,
  bfs,
  pathTo,
  bestAnchorFor,
};
