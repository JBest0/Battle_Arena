import { Link } from 'react-router-dom';
import AvatarImage from '../AvatarImage';
import { describeConfig } from '../../game/gameConfig';

// Sala de espera de una partida: jugadores, cupo y, para el anfitrión, el botón de inicio.
export default function WaitingRoom({
  match,
  currentUserId,
  minPlayers,
  busy,
  error,
  onJoin,
  onStart,
}) {
  const { players, config } = match;
  const isHost = match.createdById === currentUserId;
  const isMember = players.some((player) => player.id === currentUserId);
  const isFull = players.length >= config.maxPlayers;
  const missing = Math.max(0, minPlayers - players.length);
  const emptySlots = Math.max(0, config.maxPlayers - players.length);

  return (
    <section className="card game-config-card">
      <h2>Sala de espera</h2>
      <p className="arena-config-summary">{describeConfig(config)}</p>
      <p className="waiting-count">
        {players.length} de {config.maxPlayers} jugadores
      </p>

      <ul className="waiting-players">
        {players.map((player) => (
          <li key={player.id} className="waiting-player">
            <AvatarImage src={player.avatarUrl} username={player.username} size={40} />
            <span className="waiting-player-name">{player.username}</span>
            <span className="waiting-player-tags">
              {player.id === match.createdById && 'anfitrión'}
              {player.id === match.createdById && player.id === currentUserId && ' · '}
              {player.id === currentUserId && 'tú'}
            </span>
          </li>
        ))}
        {Array.from({ length: emptySlots }, (_, index) => (
          <li key={`empty-${index}`} className="waiting-player waiting-player-empty">
            Esperando jugador…
          </li>
        ))}
      </ul>

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      {isHost && (
        <>
          <button
            type="button"
            className="button"
            onClick={onStart}
            disabled={busy || missing > 0}
          >
            {busy ? 'Iniciando…' : 'Iniciar partida'}
          </button>
          {missing > 0 && (
            <p className="game-config-hint">
              Faltan {missing} {missing === 1 ? 'jugador' : 'jugadores'} para poder iniciar.
            </p>
          )}
        </>
      )}

      {!isHost && isMember && (
        <p role="status">Esperando a que el anfitrión inicie la partida…</p>
      )}

      {!isMember && (
        <button
          type="button"
          className="button"
          onClick={onJoin}
          disabled={busy || isFull}
        >
          {isFull ? 'Partida llena' : busy ? 'Entrando…' : 'Unirme a la partida'}
        </button>
      )}

      <p className="waiting-back">
        <Link to="/lobby">Volver a la sala de juego</Link>
      </p>
    </section>
  );
}
