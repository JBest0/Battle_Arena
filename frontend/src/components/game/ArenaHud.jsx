import AvatarImage from '../AvatarImage';
import ActiveEvents from './ActiveEvents';
import ArenaIndicators from './ArenaIndicators';
import MyStatus from './MyStatus';
import { END_MODE_LABELS } from '../../game/gameConfig';
import { isUrgent, rankPlayers } from '../../game/hudModel';
import { formatDuration } from '../../utils/dates';

function resultText(hud) {
  const winners = hud.players.filter((player) => hud.winnerIds.includes(player.id));

  if (winners.length === 0) return '';
  if (winners.length === 1) return `Ganó ${winners[0].username}`;

  return `Empate entre ${winners.map((player) => player.username).join(', ')}`;
}

// Panel lateral de la arena: reloj/objetivo, mi estado, evento activo, posiciones, peligros de
// la arena y resultado.
export default function ArenaHud({
  config,
  hud,
  currentUserId,
  scenario = null,
  soundEnabled = true,
  onToggleSound = null,
}) {
  const ranked = rankPlayers(hud.players);
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
          <span
            className={`arena-hud-value arena-hud-value-big${isUrgent(hud) ? ' is-urgent' : ''}`}
          >
            {isTime ? formatDuration(hud.timeRemaining) : hud.targetPoints}
          </span>
        </div>
      </div>

      {finished && (
        <p className="alert alert-success" role="status">
          Fin de la partida. {resultText(hud)}
        </p>
      )}

      <MyStatus hud={hud} currentUserId={currentUserId} />

      <ActiveEvents events={hud.events} />

      <ol className="arena-scoreboard" aria-label="Posiciones">
        {ranked.map((player) => (
          <li
            key={player.id}
            className={`arena-score-row${player.id === currentUserId ? ' is-me' : ''}`}
          >
            <span className="arena-score-rank">{player.rank}</span>
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
            {player.slow > 0 && <span className="score-tag score-tag-bad">Frenado</span>}
            {player.risk > 1 && <span className="score-tag score-tag-risk">x{player.risk}</span>}
            <span className="arena-score-points">{player.score}</span>
          </li>
        ))}
      </ol>

      <ArenaIndicators scenario={scenario} obstacles={hud.obstacles} guardians={hud.guardians} />

      {onToggleSound && (
        <button
          type="button"
          className="button button-small arena-sound-toggle"
          aria-pressed={soundEnabled}
          onClick={onToggleSound}
        >
          {soundEnabled ? 'Sonido activado' : 'Sonido silenciado'}
        </button>
      )}
    </aside>
  );
}
