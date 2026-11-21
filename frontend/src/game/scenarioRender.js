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

// Alturas (en unidades de arena) con las que se dibujan los volúmenes: la cara superior se
// desplaza hacia arriba y se ve el frente, lo que da sensación de profundidad sin cambiar a
// dónde apuntan los controles.
export const WALL_HEIGHT = 8;
export const REACTOR_HEIGHT = 13;

// Aclara (factor > 1) u oscurece (factor < 1) un color #rrggbb.
export function shade(color, factor) {
  const match = /^#([0-9a-f]{6})$/i.exec(color || '');
  if (!match) return color;

  const value = parseInt(match[1], 16);
  const channel = (shift) => {
    const base = (value >> shift) & 255;
    const out = factor >= 1 ? base + (255 - base) * (factor - 1) : base * factor;

    return Math.max(0, Math.min(255, Math.round(out)));
  };

  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`;
}

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

/**
 * Bloque con volumen: cara superior (desplazada hacia arriba `height`) y frente. `x, y, width,
 * depth` son la huella en el piso. Se dibuja de arriba hacia abajo para que cada bloque tape el
 * frente del que tiene detrás.
 */
export function drawExtruded(ctx, x, y, width, depth, colors, height = WALL_HEIGHT, { front = true } = {}) {
  if (front) {
    ctx.fillStyle = colors.front;
    ctx.fillRect(x, y + depth - height, width, height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.fillRect(x, y + depth - 2, width, 2);
  }

  ctx.fillStyle = colors.top;
  ctx.fillRect(x, y - height, width, depth);
  ctx.fillStyle = shade(colors.top, 1.2);
  ctx.fillRect(x, y - height, width, 2);
}

// Sombra en el piso de un volumen: cae hacia abajo y a la derecha.
function drawShadow(ctx, x, y, width, depth, height) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(x + height * 0.5, y + height * 0.8, width, depth);
}

function drawWalls(ctx, walls, size, palette) {
  const isWall = new Set(walls.map(({ col, row }) => `${col},${row}`));

  walls.forEach(({ col, row }) => drawShadow(ctx, col * size, row * size, size, size, WALL_HEIGHT));

  // `walls` viene ordenado por fila: los del sur se dibujan después y tapan el frente de los del norte
  walls.forEach(({ col, row }) => {
    drawExtruded(
      ctx,
      col * size,
      row * size,
      size,
      size,
      { top: palette.wallTop, front: palette.wall },
      WALL_HEIGHT,
      { front: !isWall.has(`${col},${row + 1}`) }
    );
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
  const lift = REACTOR_HEIGHT;
  const cx = x + width / 2;
  const cy = y + height / 2 - lift;

  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height));
  glow.addColorStop(0, `${palette.reactor}66`);
  glow.addColorStop(1, `${palette.reactor}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(x - width, y - height - lift, width * 3, height * 3);

  drawShadow(ctx, x, y, width, height, lift);

  // frente del reactor con franjas del color del núcleo
  ctx.fillStyle = shade(palette.reactor, 0.3);
  ctx.fillRect(x, y + height - lift, width, lift);
  ctx.fillStyle = `${palette.reactor}88`;
  for (let stripe = x + 6; stripe < x + width - 4; stripe += 12) {
    ctx.fillRect(stripe, y + height - lift + 3, 6, lift - 6);
  }

  // cara superior
  ctx.fillStyle = '#0b1218';
  ctx.fillRect(x, y - lift, width, height);
  ctx.strokeStyle = palette.reactor;
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y - lift + 1.5, width - 3, height - 3);

  // núcleo con brillo
  const radius = Math.min(width, height) * 0.28;
  const core = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
  core.addColorStop(0, shade(palette.reactor, 1.7));
  core.addColorStop(1, palette.reactor);
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawTerminal(ctx, terminal, size, palette) {
  const cx = terminal.col * size + size / 2;
  const r = size * 0.42;
  const base = terminal.row * size + size / 2;
  const cy = base - 4;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(cx + 2, base + r * 0.7, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

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

  drawWalls(ctx, walls, size, palette);
  terminals.forEach((terminal) => drawTerminal(ctx, terminal, size, palette));
  if (reactor) drawReactor(ctx, reactor, size, palette);

  // viñeta: los bordes quedan más oscuros y la mirada va al centro
  const vignette = ctx.createRadialGradient(
    arena.width / 2,
    arena.height / 2,
    arena.height * 0.35,
    arena.width / 2,
    arena.height / 2,
    arena.width * 0.62
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.38)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, arena.width, arena.height);
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

// Bloque macizo con volumen, como los muros del mapa (con su sombra en el piso).
function solidBlock(ctx, x, y, width, depth, front, top) {
  drawShadow(ctx, x, y, width, depth, WALL_HEIGHT);
  drawExtruded(ctx, x, y, width, depth, { top, front }, WALL_HEIGHT);
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

    const topY = y - WALL_HEIGHT; // la cara superior va desplazada hacia arriba

    if (item.kind === 'wall') {
      solidBlock(ctx, x, y, width, height, palette.wall, palette.wallTop);
    } else if (item.kind === 'barrier') {
      // barrera: franjas de peligro sobre la cara superior
      solidBlock(ctx, x, y, width, height, '#1d2026', shade(palette.barrier, 0.85));
      stripes(ctx, x + 2, topY + 3, width - 4, height - 6, 'rgba(15, 18, 24, 0.6)', 9);
      if (warn) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, topY + 1, width - 2, height - 2);
      }
    } else if (item.closed) {
      // puerta o corredor cerrado: panel oscuro con luces en el color de las puertas
      solidBlock(ctx, x, y, width, height, '#1c2630', shade(palette.door, 0.5));
      ctx.fillStyle = `${palette.door}55`;
      ctx.fillRect(x + 4, topY + 4, width - 8, Math.max(4, height - 8));
      ctx.strokeStyle = palette.door;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 4.5, topY + 4.5, width - 9, Math.max(4, height - 9));
      if (item.kind === 'corridor') {
        stripes(ctx, x + 4, topY + 4, width - 8, Math.max(4, height - 8), `${palette.door}66`, 14);
      }
      if (warn) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, topY + 1, width - 2, height - 2);
      }
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
