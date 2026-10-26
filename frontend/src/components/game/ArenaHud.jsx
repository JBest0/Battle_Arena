import AvatarImage from '../AvatarImage';
import { END_MODE_LABELS } from '../../game/gameConfig';
import { formatDuration } from '../../utils/dates';

function resultText(hud) {
  const winners = hud.players.filter((player) => hud.winnerIds.includes(player.id));

  if (winners.length === 0) return '';
  if (winners.length === 1) return `Ganó ${winners[0].username}`;

  return `Empate entre ${winners.map((player) => player.username).join(', ')}`;
}

// Panel lateral de la arena: modo, reloj/objetivo, marcador y resultado.
export default function ArenaHud({ config, hud, currentUserId }) {
  const ranked = [...hud.players].sort((a, b) => b.score - a.score);
  const finished = hud.status === 'FINISHED';
  const isTime = config.endMode === 'TIME';

  return (
    <aside className="arena-hud" aria-label="Marcador de la partida">
      <div className="arena-hud-stats">
        <div className="arena-hud-stat">
          <span className="arena-hud-label">Modo</span>
          <span className="arena-hud-value">{END_MODE_LABELS[config.endMode]}</span>
        </div>
        <div className="arena-hud-stat">
          <span className="arena-hud-label">
            {isTime ? 'Tiempo restante' : 'Puntos objetivo'}
          </span>
          <span className="arena-hud-value arena-hud-value-big">
            {isTime ? formatDuration(hud.timeRemaining) : hud.targetPoints}
          </span>
        </div>
      </div>

      {finished && (
        <p className="alert alert-success" role="status">
          Fin de la partida. {resultText(hud)}
        </p>
      )}

      <ol className="arena-scoreboard">
        {ranked.map((player) => (
          <li key={player.id} className="arena-score-row">
            <span
              className="arena-score-dot"
              style={{ backgroundColor: player.color }}
              aria-hidden="true"
            />
            <AvatarImage
              src={player.avatarUrl}
              username={player.username}
              size={32}
            />
            <span className="arena-score-name">
              {player.username}
              {player.id === currentUserId && ' (tú)'}
            </span>
            <span className="arena-score-points">{player.score}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
