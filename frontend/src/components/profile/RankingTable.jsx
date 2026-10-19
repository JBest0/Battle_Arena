import { Link } from 'react-router-dom';
import AvatarImage from '../AvatarImage';

export default function RankingTable({
  items,
  highlightUserId,
  separatedUserId,
  emptyMessage = 'Todavía no hay jugadores en el ranking.',
}) {
  if (!items || items.length === 0) {
    return <p className="empty-state">{emptyMessage}</p>;
  }

  return (
    <div className="table-wrapper">
      <table className="data-table ranking-table">
        <thead>
          <tr>
            <th scope="col">Pos.</th>
            <th scope="col">Jugador</th>
            <th scope="col">Partidas</th>
            <th scope="col">Victorias</th>
            <th scope="col">Puntos</th>
          </tr>
        </thead>
        <tbody>
          {items.map((entry) => (
            <tr
              key={entry.userId}
              className={[
                entry.userId === highlightUserId ? 'row-highlight' : '',
                entry.userId === separatedUserId ? 'row-separated' : '',
              ]
                .filter(Boolean)
                .join(' ') || undefined}
            >
              <td>#{entry.position}</td>
              <td>
                <Link className="ranking-player" to={`/players/${entry.userId}`}>
                  <AvatarImage
                    src={entry.avatarUrl}
                    username={entry.username}
                    size={32}
                  />
                  <span>{entry.username}</span>
                </Link>
              </td>
              <td>{entry.gamesPlayed}</td>
              <td>{entry.gamesWon}</td>
              <td>{entry.rankingPoints}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
