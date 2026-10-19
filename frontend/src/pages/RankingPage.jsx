import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage, getRanking } from '../api/profile';
import { useAuth } from '../auth/AuthContext';
import RankingTable from '../components/profile/RankingTable';

const RANKING_LIMIT = 50;

export default function RankingPage() {
  const { user } = useAuth();
  const [ranking, setRanking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getRanking(RANKING_LIMIT);
      setRanking(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="card">
      <h2>Ranking</h2>

      {loading && (
        <p className="empty-state" role="status">
          Cargando ranking…
        </p>
      )}

      {error && (
        <>
          <p className="alert alert-error" role="alert">
            {error}
          </p>
          <button type="button" className="button" onClick={load}>
            Reintentar
          </button>
        </>
      )}

      {ranking && (
        <>
          <p>{ranking.totalPlayers} jugadores registrados</p>
          <RankingTable
            items={ranking.items}
            highlightUserId={user?.id}
            emptyMessage="Todavía no hay jugadores en el ranking."
          />
        </>
      )}
    </section>
  );
}
