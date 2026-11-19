/*
 * Dibujo del escenario (la capa fija de la arena): piso, muros, reactor y terminales.
 * Lo usan <ArenaCanvas> (capa de fondo) y <ScenarioPreview> (miniatura).
 * Trabaja en unidades de arena: quien llama aplica la escala con ctx.setTransform.
 */

export const DEFAULT_PALETTE = {
  floor: '#16212c',
  grid: '#223140',
  wall: '#3b5368',
  wallTop: '#5d7a94',
  reactor: '#3ad4ff',
  terminal: '#7bffb0',
  cell: '#ffd166',
};

export function scenarioPalette(scenario) {
  return { ...DEFAULT_PALETTE, ...(scenario?.palette || {}) };
}

// Lee el mapa de texto: muros, reactor y terminales como celdas (columna, fila).
export function parseScenarioMap(map) {
  const walls = [];
  const terminals = [];
  const reactorCells = [];

  map.forEach((line, row) => {
    [...line].forEach((ch, col) => {
      if (ch === '#') walls.push({ col, row });
      if (ch === 'T') terminals.push({ col, row });
      if (ch === 'R') reactorCells.push({ col, row });
    });
  });

  let reactor = null;
  if (reactorCells.length > 0) {
    const cols = reactorCells.map((c) => c.col);
    const rows = reactorCells.map((c) => c.row);
    reactor = {
      col: Math.min(...cols),
      row: Math.min(...rows),
      cols: Math.max(...cols) - Math.min(...cols) + 1,
      rows: Math.max(...rows) - Math.min(...rows) + 1,
    };
  }

  return { walls, terminals, reactor };
}

function drawWalls(ctx, walls, size, palette) {
  const isWall = new Set(walls.map(({ col, row }) => `${col},${row}`));

  walls.forEach(({ col, row }) => {
    const x = col * size;
    const y = row * size;

    ctx.fillStyle = palette.wall;
    ctx.fillRect(x, y, size, size);

    // sensación de volumen: cara superior clara si arriba no hay muro, sombra si abajo no hay
    if (!isWall.has(`${col},${row - 1}`)) {
      ctx.fillStyle = palette.wallTop;
      ctx.fillRect(x, y, size, size * 0.3);
    }
    if (!isWall.has(`${col},${row + 1}`)) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(x, y + size * 0.78, size, size * 0.22);
    }
  });
}

function drawReactor(ctx, reactor, size, palette) {
  const x = reactor.col * size;
  const y = reactor.row * size;
  const width = reactor.cols * size;
  const height = reactor.rows * size;
  const cx = x + width / 2;
  const cy = y + height / 2;

  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height));
  glow.addColorStop(0, `${palette.reactor}55`);
  glow.addColorStop(1, `${palette.reactor}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(x - width, y - height, width * 3, height * 3);

  ctx.fillStyle = '#0b1218';
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = palette.reactor;
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y + 1.5, width - 3, height - 3);

  ctx.fillStyle = palette.reactor;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.min(width, height) * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

function drawTerminal(ctx, terminal, size, palette) {
  const cx = terminal.col * size + size / 2;
  const cy = terminal.row * size + size / 2;
  const r = size * 0.42;

  ctx.fillStyle = '#0b1218';
  ctx.strokeStyle = palette.terminal;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = palette.terminal;
  ctx.fillRect(cx - 2, cy - 2, 4, 4);
}

export function drawScenarioLayer(ctx, scenario, arena) {
  const palette = scenarioPalette(scenario);
  const size = arena.cellSize;
  const { walls, terminals, reactor } = parseScenarioMap(scenario.map);

  ctx.fillStyle = palette.floor;
  ctx.fillRect(0, 0, arena.width, arena.height);

  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = size; x < arena.width; x += size) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, arena.height);
  }
  for (let y = size; y < arena.height; y += size) {
    ctx.moveTo(0, y);
    ctx.lineTo(arena.width, y);
  }
  ctx.stroke();

  if (reactor) drawReactor(ctx, reactor, size, palette);
  terminals.forEach((terminal) => drawTerminal(ctx, terminal, size, palette));
  drawWalls(ctx, walls, size, palette);
}
