import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AvatarImage from '../AvatarImage';
import { getErrorMessage, getMatchHistory } from '../../api/profile';
import { formatDateTime, formatDuration } from '../../utils/dates';

const PAGE_SIZE = 10;

const RESULT_LABELS = {
  WIN: 'Victoria',
  LOSS: 'Derrota',
  DRAW: 'Empate',
};

const END_MODE_LABELS = {
  TIME: 'Tiempo',
  POINTS: 'Puntos',
};

export default function MatchHistoryTable({ userId, isOwnProfile = false }) {
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(
    async (targetPage) => {
      setLoading(true);
      setError('');
      try {
        const data = await getMatchHistory(userId, targetPage, PAGE_SIZE);
        setHistory(data);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    load(page);
  }, [load, page]);

  if (loading && !history) {
    return <p className="empty-state">Cargando historial…</p>;
  }

  if (error) {
    return (
      <div>
        <p className="alert alert-error" role="alert">
          {error}
        </p>
        <button
          type="button"
          className="button button-small"
          onClick={() => load(page)}
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!history || history.items.length === 0) {
    return isOwnProfile ? (
      <p className="empty-state">
        Aún no has jugado partidas.{' '}
        <Link to="/lobby">¡Entra a la sala de juego para empezar!</Link>
      </p>
    ) : (
      <p className="empty-state">Este jugador aún no ha jugado partidas.</p>
    );
  }

  const totalPages = Math.max(1, Math.ceil(history.total / PAGE_SIZE));

  return (
    <div>
      <div className="table-wrapper">
        <table className="data-table match-history-table">
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Duración</th>
              <th scope="col">Modo de fin</th>
              <th scope="col">Rivales</th>
              <th scope="col">Puntaje</th>
              <th scope="col">Posición</th>
              <th scope="col">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {history.items.map((match) => (
              <tr key={match.matchId}>
                <td>{formatDateTime(match.endedAt)}</td>
                <td>{formatDuration(match.durationSeconds)}</td>
                <td>{END_MODE_LABELS[match.endMode] || match.endMode || '—'}</td>
                <td>
                  {match.opponents.length === 0 ? (
                    '—'
                  ) : (
                    <ul className="opponents-list">
                      {match.opponents.map((opponent) => (
                        <li key={opponent.id}>
                          <Link
                            className="opponent-link"
                            to={`/players/${opponent.id}`}
                          >
                            <AvatarImage
                              src={opponent.avatarUrl}
                              username={opponent.username}
                              size={24}
                            />
                            <span>{opponent.username}</span>
                          </Link>{' '}
                          <span className="opponent-score">
                            {opponent.finalScore}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td>{match.finalScore}</td>
                <td>{match.position}</td>
                <td>
                  <span
                    className={`result-badge result-${
                      match.result ? match.result.toLowerCase() : 'unknown'
                    }`}
                  >
                    {RESULT_LABELS[match.result] || 'Sin resultado'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button
          type="button"
          className="button button-small"
          disabled={page <= 1 || loading}
          onClick={() => setPage((current) => current - 1)}
        >
          Anterior
        </button>
        <span>
          Página {history.page} de {totalPages}
        </span>
        <button
          type="button"
          className="button button-small"
          disabled={page >= totalPages || loading}
          onClick={() => setPage((current) => current + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
