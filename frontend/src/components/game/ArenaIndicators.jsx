import { scenarioPalette } from '../../game/scenarioRender';
import {
  guardianLegend,
  liveText,
  obstacleAlerts,
  reactorLegend,
  scenarioLegend,
  summarizeObstacles,
} from '../../game/hudModel';

// Peligros de la arena: leyenda de lo que trae el escenario (trampas, sectores, puertas,
// barreras, paredes que cambian), su estado en vivo y el aviso de lo que está por cambiar.
export default function ArenaIndicators({ scenario, obstacles, guardians = 0, reactor = null }) {
  const legend = scenarioLegend(scenario);
  const guardian = guardianLegend(guardians);
  const reactorEntry = reactorLegend(reactor);
  if (legend.length === 0 && !guardian && !reactorEntry) return null;

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
        {reactorEntry && (
          <li key={reactorEntry.id} className="legend-item">
            <span className="legend-swatch legend-swatch-reactor" aria-hidden="true" />
            <span className="legend-text">
              <span className="legend-label">{reactorEntry.label}</span>
              <span className="legend-hint">{reactorEntry.hint}</span>
            </span>
            <span className="legend-live">{reactorEntry.live}</span>
          </li>
        )}
        {guardian && (
          <li key={guardian.id} className="legend-item">
            <span className="legend-swatch legend-swatch-guardian" aria-hidden="true" />
            <span className="legend-text">
              <span className="legend-label">{guardian.label}</span>
              <span className="legend-hint">{guardian.hint}</span>
            </span>
            <span className="legend-live">{guardian.live}</span>
          </li>
        )}
      </ul>
    </section>
  );
}
