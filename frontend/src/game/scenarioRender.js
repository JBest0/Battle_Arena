/*
 * Dibujo del escenario (la capa fija de la arena): piso, trampas, sectores de riesgo, muros,
 * reactor y terminales; y de los obstáculos que se mueven (barreras, puertas, corredores y
 * paredes aleatorias), que se dibujan cada frame encima de esa capa.
 * Lo usan <ArenaCanvas> (capa de fondo y obstáculos) y <ScenarioPreview> (miniatura).
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
  // opcionales (cada escenario puede definir los suyos)
  trap: '#ff9f1c',
  riskZone: '#ff4d6d',
  barrier: '#ffd166',
  door: '#4cc9f0',
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

// Trampa de ralentización: zona rayada del color `palette.trap`.
function drawTrap(ctx, trap, size, palette) {
  const x = trap.col * size;
  const y = trap.row * size;
  const width = trap.cols * size;
  const height = trap.rows * size;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.fillStyle = `${palette.trap}30`;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = `${palette.trap}aa`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let d = -height; d < width; d += 12) {
    ctx.moveTo(x + d, y + height);
    ctx.lineTo(x + d + height, y);
  }
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = palette.trap;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.75, y + 0.75, width - 1.5, height - 1.5);
}

// Sector de riesgo: zona tenue con borde de puntos y el multiplicador de puntos.
function drawRiskZone(ctx, zone, size, palette) {
  const x = zone.col * size;
  const y = zone.row * size;
  const width = zone.cols * size;
  const height = zone.rows * size;

  ctx.fillStyle = `${palette.riskZone}1c`;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = `${palette.riskZone}cc`;
  ctx.lineWidth = 2;
  ctx.setLineDash([2, 6]);
  ctx.lineCap = 'round';
  ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
  ctx.setLineDash([]);
  ctx.lineCap = 'butt';

  ctx.fillStyle = `${palette.riskZone}99`;
  ctx.font = '700 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`x${zone.multiplier}`, x + width / 2, y + height / 2);
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

  (scenario.riskZones || []).forEach((zone) => drawRiskZone(ctx, zone, size, palette));
  (scenario.traps || []).forEach((trap) => drawTrap(ctx, trap, size, palette));

  if (reactor) drawReactor(ctx, reactor, size, palette);
  terminals.forEach((terminal) => drawTerminal(ctx, terminal, size, palette));
  drawWalls(ctx, walls, size, palette);
}

// ---- Obstáculos que se mueven (se dibujan cada frame) ----

function stripes(ctx, x, y, width, height, color, gap = 10) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let d = -height; d < width; d += gap) {
    ctx.moveTo(x + d, y + height);
    ctx.lineTo(x + d + height, y);
  }
  ctx.stroke();
  ctx.restore();
}

// Bloque macizo con cara superior clara y sombra, como los muros del mapa.
function solidBlock(ctx, x, y, width, height, body, top) {
  ctx.fillStyle = body;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = top;
  ctx.fillRect(x, y, width, Math.min(height, 7));
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(x, y + height - 5, width, 5);
}

function blinking(time) {
  return Math.floor(time / 160) % 2 === 0;
}

/**
 * Dibuja los obstáculos dinámicos del estado (`state.obstacles`).
 * @param appear  (id) => 0..1, para que una pared nueva aparezca con un fundido
 */
export function drawObstacles(ctx, obstacles, size, palette, time, appear = () => 1) {
  for (const item of obstacles) {
    const x = item.col * size;
    const y = item.row * size;
    const width = item.cols * size;
    const height = item.rows * size;
    const warn = item.warning && blinking(time);

    ctx.save();
    ctx.globalAlpha = appear(item.id);

    if (item.kind === 'wall') {
      solidBlock(ctx, x, y, width, height, palette.wall, palette.wallTop);
    } else if (item.kind === 'barrier') {
      solidBlock(ctx, x, y, width, height, '#2b2f36', palette.barrier);
      stripes(ctx, x + 2, y + 9, width - 4, height - 16, `${palette.barrier}cc`);
      if (warn) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
      }
    } else if (item.closed) {
      // puerta o corredor cerrado: panel con luces en el color de las puertas
      solidBlock(ctx, x, y, width, height, '#26323d', palette.door);
      ctx.fillStyle = `${palette.door}55`;
      ctx.fillRect(x + 4, y + 10, width - 8, Math.max(4, height - 18));
      ctx.strokeStyle = palette.door;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 4.5, y + 10.5, width - 9, Math.max(4, height - 18));
      if (item.kind === 'corridor') stripes(ctx, x + 4, y + 10, width - 8, Math.max(4, height - 18), `${palette.door}66`, 14);
    } else {
      // abierta: se marca el marco para que se vea dónde se va a cerrar
      ctx.strokeStyle = warn ? '#ff4d4d' : `${palette.door}99`;
      ctx.fillStyle = warn ? 'rgba(255, 77, 77, 0.28)' : `${palette.door}14`;
      ctx.fillRect(x, y, width, height);
      ctx.lineWidth = warn ? 3 : 1.5;
      ctx.setLineDash([6, 5]);
      ctx.strokeRect(x + 1.5, y + 1.5, width - 3, height - 3);
      ctx.setLineDash([]);
    }

    ctx.restore();
  }
}
