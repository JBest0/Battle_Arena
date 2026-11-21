import StatusChips from './StatusChips';
import { myStatus } from '../../game/hudModel';

// "Mi estado": posición, puntaje, cuánto vale cada celda ahora y los efectos que tengo.
export default function MyStatus({ hud, currentUserId }) {
  const status = myStatus(hud, currentUserId);
  if (!status) return null;

  return (
    <section className="my-status" aria-label="Mi estado">
      <h3 className="arena-hud-label">Mi estado</h3>
      <div className="my-status-main">
        <div className="my-status-block">
          <span className="my-status-number">{status.rank}.º</span>
          <span className="my-status-caption">de {status.total}</span>
        </div>
        <div className="my-status-block">
          <span className="my-status-number">{status.score}</span>
          <span className="my-status-caption">puntos</span>
        </div>
        <div className="my-status-block">
          <span
            className={`my-status-number${status.pointsPerCell > 1 ? ' is-boosted' : ''}`}
          >
            x{status.pointsPerCell}
          </span>
          <span className="my-status-caption">por celda</span>
        </div>
      </div>
      <div aria-live="polite">
        <StatusChips effects={status.effects} emptyText="Sin efectos activos" />
      </div>
    </section>
  );
}
