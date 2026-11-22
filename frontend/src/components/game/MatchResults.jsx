import AvatarImage from '../AvatarImage';
import { rankPlayers } from '../../game/hudModel';
import { formatDuration } from '../../utils/dates';

function PodiumPlayer({ player, place }) {
  return (
    <article className={`podium-place podium-place-${place}`}>
      <span className="podium-medal" aria-label={`Posición ${place}`}>
        {place === 1 ? '1º' : place === 2 ? '2º' : '3º'}
      </span>
      <AvatarImage src={player.avatarUrl} username={player.username} size={72} />
      <strong>{player.username}</strong>
      <span>{player.score} puntos</span>
    </article>
  );
}

export default function MatchResults({ hud, match, currentUserId }) {
  const ranked = rankPlayers(hud.players);
  const winnerIds = hud.winnerIds || [];
  const winners = ranked.filter((player) => winnerIds.includes(player.id));
  const isDraw = winners.length !== 1;
  const podium = ranked.slice(0, 3);

  return (
    <section className="match-results card" role="status" aria-live="polite">
      <div className="match-results-celebration" aria-hidden="true">
        <span>✦</span><span>★</span><span>✦</span>
      </div>

      <p className="match-results-kicker">Partida finalizada</p>
      <h2>{isDraw ? 'Resultado: empate' : `Ganó ${winners[0]?.username}`}</h2>

      {podium.length > 0 && (
        <div className="podium" aria-label="Podio de la partida">
          {podium.map((player) => (
            <PodiumPlayer key={player.id} player={player} place={player.rank} />
          ))}
        </div>
      )}

      <div className="match-results-summary">
        <span><strong>{ranked.length}</strong> participantes</span>
        <span><strong>{formatDuration(hud.elapsed)}</strong> de duración</span>
        <span><strong>{ranked.find((player) => player.id === currentUserId)?.score ?? 0}</strong> puntos tuyos</span>
      </div>

      {match.status === 'FINISHED' && (
        <p className="match-results-persisted">Resultado consolidado y guardado en el historial.</p>
      )}
    </section>
  );
}
