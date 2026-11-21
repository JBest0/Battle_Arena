import { scenarioPalette } from '../../game/scenarioRender';
import { liveText, obstacleAlerts, scenarioLegend, summarizeObstacles } from '../../game/hudModel';

// Peligros de la arena: leyenda de lo que trae el escenario (trampas, sectores, puertas,
// barreras, paredes que cambian), su estado en vivo y el aviso de lo que está por cambiar.
export default function ArenaIndicators({ scenario, obstacles }) {
  const legend = scenarioLegend(scenario);
  if (legend.length === 0) return null;

  const summary = summarizeObstacles(obstacles);
  const alerts = obstacleAlerts(obstacles);
  const palette = scenarioPalette(scenario);

  return (
    <section className="arena-indicators" aria-label="Peligros de la arena">
      <h3 className="arena-hud-label">Peligros de la arena</h3>

      <p className="arena-alert" role="status" hidden={alerts.length === 0}>
        {alerts.join(' · ')}
      </p>

      <ul className="legend-list">
        {legend.map((entry) => (
          <li key={entry.id} className="legend-item">
            <span
              className={`legend-swatch legend-swatch-${entry.id}`}
              style={{ '--swatch': palette[entry.color] }}
              aria-hidden="true"
            />
            <span className="legend-text">
              <span className="legend-label">{entry.label}</span>
              <span className="legend-hint">{entry.hint}</span>
            </span>
            <span className="legend-live">{liveText(entry, summary)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
