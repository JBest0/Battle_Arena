import { useEffect, useRef } from 'react';
import { DEFAULT_PALETTE, drawScenarioLayer } from '../../game/scenarioRender';

// Miniatura de un escenario. Sin escenario (por ejemplo "Aleatorio") muestra un signo ?.
export default function ScenarioPreview({ scenario, arena, width = 240, label }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    const height = Math.round((width * arena.height) / arena.width);

    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    const scale = canvas.width / arena.width;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    if (scenario) {
      drawScenarioLayer(ctx, scenario, arena);
    } else {
      ctx.fillStyle = DEFAULT_PALETTE.floor;
      ctx.fillRect(0, 0, arena.width, arena.height);
      ctx.fillStyle = DEFAULT_PALETTE.wallTop;
      ctx.font = '700 180px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', arena.width / 2, arena.height / 2);
    }
  }, [scenario, arena, width]);

  return (
    <canvas
      ref={canvasRef}
      className="scenario-preview"
      style={{ width, aspectRatio: `${arena.width} / ${arena.height}` }}
      role="img"
      aria-label={label || (scenario ? `Mapa de ${scenario.name}` : 'Escenario aleatorio')}
    />
  );
}
