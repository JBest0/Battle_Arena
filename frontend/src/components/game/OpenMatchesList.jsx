import { describeConfig } from '../../game/gameConfig';

// Partidas en espera a las que el jugador puede unirse desde la sala de juego.
export default function OpenMatchesList({ matches, busyId, onJoin }) {
  if (matches.length === 0) {
    return <p className="game-config-hint">No hay partidas abiertas. Crea una.</p>;
  }

  return (
    <ul className="open-matches">
      {matches.map((match) => {
        const full = match.players.length >= match.config.maxPlayers;
        const host = match.players.find((player) => player.id === match.createdById);

        return (
          <li key={match.id} className="open-match">
            <div className="open-match-info">
              <span className="open-match-title">
                {host ? `Partida de ${host.username}` : 'Partida'}
              </span>
              <span className="open-match-meta">
                {describeConfig(match.config)} · {match.players.length}/
                {match.config.maxPlayers}
              </span>
            </div>
            <button
              type="button"
              className="button button-small"
              onClick={() => onJoin(match.id)}
              disabled={full || busyId === match.id}
            >
              {full ? 'Llena' : 'Unirme'}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
