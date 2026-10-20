import { useEffect, useRef } from 'react';

const TAU = Math.PI * 2;
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

function drawItems(ctx, items, radius) {
  ctx.fillStyle = COLORS.item;
  ctx.strokeStyle = COLORS.itemEdge;
  ctx.lineWidth = 2;

  for (const item of items) {
    ctx.beginPath();
    ctx.arc(item.x, item.y, radius, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
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

function draw(ctx, canvas, state) {
  const { arena } = state;
  const scale = canvas.width / arena.width;

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawFloor(ctx, arena);
  drawItems(ctx, state.items, arena.itemRadius);
  for (const player of state.players) {
    drawPlayer(ctx, player, arena.playerRadius);
  }
}

/*
 * Dibuja la arena a partir de stateRef.current (ver game/arenaState.js). Lee el estado
 * en cada frame, así que las actualizaciones por socket no re-renderizan React.
 */
export default function ArenaCanvas({ stateRef, arena }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    function resize() {
      const ratio = window.devicePixelRatio || 1;
      const cssWidth = canvas.getBoundingClientRect().width;
      canvas.width = Math.max(1, Math.round(cssWidth * ratio));
      canvas.height = Math.round((canvas.width * arena.height) / arena.width);
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let frame = 0;
    function render() {
      const state = stateRef.current;
      if (state) {
        draw(ctx, canvas, state);
      }
      frame = requestAnimationFrame(render);
    }
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [stateRef, arena]);

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
