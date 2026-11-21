import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage, getRankingPage } from '../api/profile';
import { useAuth } from '../auth/AuthContext';
import RankingTable from '../components/profile/RankingTable';

const PAGE_SIZE = 20;

export default function RankingPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [ranking, setRanking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (targetPage) => {
    setLoading(true);
    setError('');
    try {
      const data = await getRankingPage(targetPage, PAGE_SIZE);
      setRanking(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page);
  }, [load, page]);

  const totalPages = ranking
    ? Math.max(1, Math.ceil(ranking.totalPlayers / ranking.pageSize))
    : 1;

  return (
    <section className="card">
      <h2>Ranking</h2>

      <button
        type="button"
        className="button button-small"
        onClick={() => load(page)}
        disabled={loading}
      >
        Actualizar
      </button>

      {loading && !ranking && (
        <p className="empty-state" role="status">
          Cargando ranking…
        </p>
      )}

      {error && (
        <>
          <p className="alert alert-error" role="alert">
            {error}
          </p>
          <button type="button" className="button" onClick={() => load(page)}>
            Reintentar
          </button>
        </>
      )}

      {ranking && !error && (
        <>
          <p>{ranking.totalPlayers} jugadores registrados</p>
          <RankingTable
            items={ranking.items}
            highlightUserId={user?.id}
            metricLabel={ranking.metric?.label}
            emptyMessage="Todavía no hay jugadores en el ranking."
          />

          {ranking.totalPlayers > 0 && (
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
                Página {ranking.page} de {totalPages}
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
          )}
        </>
      )}
    </section>
  );
}
