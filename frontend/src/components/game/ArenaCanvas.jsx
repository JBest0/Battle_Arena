import { useEffect, useRef } from 'react';
import {
  drawObstacles,
  drawScenarioLayer,
  parseScenarioMap,
  scenarioPalette,
} from '../../game/scenarioRender';

const TAU = Math.PI * 2;
// Luz que conserva el jugador local dentro de la zona en apagón (unidades de arena).
const BLACKOUT_LIGHT_RADIUS = 80;
const BLACKOUT_ALPHA = 0.82;
const BONUS_ITEM_COLOR = '#4cc9f0';
const COLORS = {
  floor: '#16212c',
  grid: '#223140',
  wall: '#3b5368',
  item: '#ffd166',
  itemEdge: 'rgba(255, 255, 255, 0.6)',
  label: 'rgba(15, 23, 42, 0.75)',
  labelText: '#f5f7fa',
  fallback: '#dbe4ea',
  fallbackText: '#1f2933',
};

// Caché de avatares: se descarga cada URL una sola vez y se reutiliza en cada frame.
const avatarCache = new Map();

function getAvatar(url) {
  if (!url) return null;

  let entry = avatarCache.get(url);
  if (!entry) {
    const image = new Image();
    entry = { image, status: 'loading' };
    image.onload = () => {
      entry.status = 'ready';
    };
    image.onerror = () => {
      entry.status = 'failed';
    };
    image.src = url;
    avatarCache.set(url, entry);
  }

  return entry.status === 'ready' ? entry.image : null;
}

function drawFloor(ctx, arena) {
  ctx.fillStyle = COLORS.floor;
  ctx.fillRect(0, 0, arena.width, arena.height);

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 50; x < arena.width; x += 50) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, arena.height);
  }
  for (let y = 50; y < arena.height; y += 50) {
    ctx.moveTo(0, y);
    ctx.lineTo(arena.width, y);
  }
  ctx.stroke();

  ctx.strokeStyle = COLORS.wall;
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, arena.width - 6, arena.height - 6);
}

function drawItems(ctx, items, radius, color = COLORS.item) {
  ctx.fillStyle = color;
  ctx.strokeStyle = COLORS.itemEdge;
  ctx.lineWidth = 2;

  for (const item of items) {
    ctx.beginPath();
    ctx.arc(item.x, item.y, radius, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
}

// Muros que un evento abrió (ruta alternativa): se tapan con piso y se marcan con el color
// del evento para que se vea por dónde se puede pasar.
function drawOpenWalls(ctx, openWalls, arena, palette, accent) {
  const size = arena.cellSize;

  for (const [col, row] of openWalls) {
    const x = col * size;
    const y = row * size;

    ctx.fillStyle = palette.floor;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = `${accent}33`;
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
    ctx.setLineDash([]);
  }
}

// Sobrecarga del reactor: el reactor late con el color del evento.
function drawReactorPulse(ctx, reactor, size, accent, time) {
  const x = reactor.col * size;
  const y = reactor.row * size;
  const width = reactor.cols * size;
  const height = reactor.rows * size;
  const pulse = 0.5 + 0.5 * Math.sin(time / 140);

  ctx.save();
  ctx.globalAlpha = 0.25 + 0.35 * pulse;
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, width, height);
  ctx.globalAlpha = 0.6 + 0.4 * pulse;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3 + 3 * pulse;
  ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
  ctx.restore();
}

// Apagón: oscurece la región del evento, con una luz suave alrededor del jugador local.
function drawBlackout(ctx, region, light) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(region.x, region.y, region.width, region.height);
  ctx.clip();

  ctx.fillStyle = `rgba(2, 4, 10, ${BLACKOUT_ALPHA})`;
  if (light) {
    ctx.beginPath();
    ctx.rect(region.x, region.y, region.width, region.height);
    ctx.arc(light.x, light.y, BLACKOUT_LIGHT_RADIUS, 0, TAU, true);
    ctx.fill('evenodd');

    const glow = ctx.createRadialGradient(
      light.x,
      light.y,
      BLACKOUT_LIGHT_RADIUS * 0.45,
      light.x,
      light.y,
      BLACKOUT_LIGHT_RADIUS
    );
    glow.addColorStop(0, 'rgba(2, 4, 10, 0)');
    glow.addColorStop(1, `rgba(2, 4, 10, ${BLACKOUT_ALPHA})`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(light.x, light.y, BLACKOUT_LIGHT_RADIUS, 0, TAU);
    ctx.fill();
  } else {
    ctx.fillRect(region.x, region.y, region.width, region.height);
  }
  ctx.restore();
}

// Jugador ralentizado por una trampa: anillo discontinuo que gira, en el color de las trampas.
function drawSlowRing(ctx, player, radius, color, time) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.setLineDash([7, 6]);
  ctx.lineDashOffset = -time / 60;
  ctx.beginPath();
  ctx.arc(player.x, player.y, radius + 9, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

// Jugador dentro de un sector de riesgo: etiqueta con el multiplicador que está ganando.
function drawRiskBadge(ctx, player, radius, color) {
  const x = player.x + radius + 4;
  const y = player.y - radius - 4;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 11, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`x${player.risk}`, x, y + 0.5);
}

function drawPlayer(ctx, player, radius) {
  const { x, y } = player;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + radius * 0.9, radius * 0.8, radius * 0.3, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = player.color;
  ctx.beginPath();
  ctx.arc(x, y, radius + 4, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.clip();

  const avatar = getAvatar(player.avatarUrl);
  if (avatar) {
    ctx.drawImage(avatar, x - radius, y - radius, radius * 2, radius * 2);
  } else {
    ctx.fillStyle = COLORS.fallback;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.fillStyle = COLORS.fallbackText;
    ctx.font = `700 ${radius}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((player.username || '?').charAt(0).toUpperCase(), x, y + 1);
  }
  ctx.restore();

  ctx.font = '600 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = `${player.username} · ${player.score}`;
  const width = ctx.measureText(label).width + 12;
  const labelY = y + radius + 18;

  ctx.fillStyle = COLORS.label;
  ctx.fillRect(x - width / 2, labelY - 10, width, 20);
  ctx.fillStyle = COLORS.labelText;
  ctx.fillText(label, x, labelY);
}

function draw(ctx, canvas, state, arena, layer, scenario, currentUserId, reactor, time, appear) {
  const scale = canvas.width / arena.width;
  const palette = scenarioPalette(scenario);
  const event = state.events && state.events.length > 0 ? state.events[0] : null;
  const accent = event?.accent || '#7bffb0';

  if (layer) {
    // capa fija del escenario (piso, muros, reactor), dibujada una sola vez por tamaño
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  } else {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawFloor(ctx, arena);
  }
  if (state.openWalls && state.openWalls.length > 0) {
    drawOpenWalls(ctx, state.openWalls, arena, palette, accent);
  }
  if (state.obstacles && state.obstacles.length > 0) {
    drawObstacles(ctx, state.obstacles, arena.cellSize, palette, time, appear);
  }
  if (event?.type === 'reactor-overload' && reactor) {
    drawReactorPulse(ctx, reactor, arena.cellSize, accent, time);
  }

  // Las celdas extra de la lluvia de energía se distinguen de las normales.
  drawItems(ctx, state.items.filter((item) => !item.bonus), arena.itemRadius, palette.cell);
  drawItems(ctx, state.items.filter((item) => item.bonus), arena.itemRadius + 2, BONUS_ITEM_COLOR);
  for (const player of state.players) {
    if (player.slow > 0) drawSlowRing(ctx, player, arena.playerRadius, palette.trap, time);
    drawPlayer(ctx, player, arena.playerRadius);
    if (player.risk > 1) drawRiskBadge(ctx, player, arena.playerRadius, palette.riskZone);
  }

  if (event?.params?.region) {
    const me = state.players.find((player) => player.id === currentUserId);
    drawBlackout(ctx, event.params.region, me ? { x: me.x, y: me.y } : null);
  }
}

/*
 * Dibuja la arena a partir de stateRef.current (ver game/arenaState.js) y las medidas de
 * `arena`. Lee el estado en cada frame, así que las actualizaciones por socket no
 * re-renderizan React.
 */
export default function ArenaCanvas({ stateRef, arena, scenario = null, currentUserId = null }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    let layer = null;
    const reactor = scenario ? parseScenarioMap(scenario.map).reactor : null;
    // Las paredes nuevas aparecen con un fundido: se anota cuándo se vio cada obstáculo.
    const firstSeen = new Map();
    const appear = (id) => {
      if (!firstSeen.has(id)) firstSeen.set(id, performance.now());

      return Math.min(1, (performance.now() - firstSeen.get(id)) / 400);
    };

    function rebuildLayer() {
      if (!scenario) {
        layer = null;
        return;
      }

      layer = document.createElement('canvas');
      layer.width = canvas.width;
      layer.height = canvas.height;
      const layerCtx = layer.getContext('2d');
      const scale = canvas.width / arena.width;
      layerCtx.setTransform(scale, 0, 0, scale, 0, 0);
      drawScenarioLayer(layerCtx, scenario, arena);
    }

    function resize() {
      const ratio = window.devicePixelRatio || 1;
      const cssWidth = canvas.getBoundingClientRect().width;
      canvas.width = Math.max(1, Math.round(cssWidth * ratio));
      canvas.height = Math.round((canvas.width * arena.height) / arena.width);
      rebuildLayer();
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let frame = 0;
    function render() {
      const state = stateRef.current;
      if (state) {
        draw(ctx, canvas, state, arena, layer, scenario, currentUserId, reactor, performance.now(), appear);
      }
      frame = requestAnimationFrame(render);
    }
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [stateRef, arena, scenario, currentUserId]);

  return (
    <canvas
      ref={canvasRef}
      className="arena-canvas"
      style={{ aspectRatio: `${arena.width} / ${arena.height}` }}
      role="img"
      aria-label="Arena de juego con los jugadores y los puntos por recoger"
    >
      Tu navegador no puede mostrar la arena.
    </canvas>
  );
}
