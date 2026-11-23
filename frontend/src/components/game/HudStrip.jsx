import StatusChips from './StatusChips';
import { formatDuration } from '../../utils/dates';
import { isUrgent, myEffects, myStatus, obstacleAlerts } from '../../game/hudModel';

// Resumen compacto para pantallas pequeñas: reloj, posición, puntaje, efectos y avisos. Va
// encima de la arena, así lo importante se ve sin bajar hasta el panel completo.
export default function HudStrip({ config, hud, currentUserId }) {
  const status = myStatus(hud, currentUserId);
  const isTime = config.endMode === 'TIME';
  const overtime = hud.status === 'OVERTIME';
  const effects = status ? myEffects(status.me, hud.events, { includeEvents: true }) : [];
  const alerts = obstacleAlerts(hud.obstacles);

  return (
    <div className="hud-strip" aria-label="Resumen de la partida">
      <div className="hud-strip-main">
        <span className={`hud-strip-time${isUrgent(hud) ? ' is-urgent' : ''}`}>
          {overtime
            ? `Prórroga ${formatDuration(hud.overtimeRemaining)}`
            : isTime
              ? formatDuration(hud.timeRemaining)
              : `${hud.targetPoints} pts`}
        </span>
        {status && (
          <>
            <span className="hud-strip-rank">
              {status.rank}.º de {status.total}
            </span>
            <span className="hud-strip-score">
              {status.score} pts · x{status.pointsPerCell}
            </span>
          </>
        )}
      </div>

      <StatusChips effects={effects} />
      {alerts.length > 0 && <p className="arena-alert">{alerts.join(' · ')}</p>}
    </div>
  );
}
