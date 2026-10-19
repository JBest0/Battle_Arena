import { useCallback, useEffect, useState } from 'react';
import {
  Link,
  Navigate,
  useParams,
} from 'react-router-dom';
import { getErrorMessage, getProfile, getRanking } from '../api/profile';
import { useAuth } from '../auth/AuthContext';
import AchievementsGrid from '../components/profile/AchievementsGrid';
import MatchHistoryTable from '../components/profile/MatchHistoryTable';
import ProfileHeader from '../components/profile/ProfileHeader';
import RankingTable from '../components/profile/RankingTable';
import StatsGrid from '../components/profile/StatsGrid';

const TOP_RANKING_LIMIT = 10;

export default function PlayerProfilePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [topRanking, setTopRanking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setNotFound(false);
    try {
      const [profileData, rankingData] = await Promise.all([
        getProfile(id),
        getRanking(TOP_RANKING_LIMIT),
      ]);
      setProfile(profileData);
      setTopRanking(rankingData.items);
    } catch (err) {
      if (err.response?.status === 404) {
        setNotFound(true);
      } else {
        setError(getErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (user?.id === id) {
    return <Navigate to="/profile" replace />;
  }

  if (loading) {
    return (
      <section className="card profile-card">
        <p className="empty-state" role="status">
          Cargando perfil…
        </p>
      </section>
    );
  }

  if (notFound) {
    return (
      <section className="card profile-card">
        <h2>Este jugador no existe</h2>
        <p>El enlace puede estar incorrecto o la cuenta fue eliminada.</p>
        <p className="form-footer">
          <Link to="/profile">Volver a mi perfil</Link>
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="card profile-card">
        <p className="alert alert-error" role="alert">
          {error}
        </p>
        <button type="button" className="button" onClick={load}>
          Reintentar
        </button>
      </section>
    );
  }

  const ownEntry = {
    position: profile.ranking.position,
    userId: profile.user.id,
    username: profile.user.username,
    avatarUrl: profile.user.avatarUrl,
    rankingPoints: profile.stats.rankingPoints,
    gamesPlayed: profile.stats.gamesPlayed,
    gamesWon: profile.stats.gamesWon,
  };
  const isInTop = topRanking.some((entry) => entry.userId === profile.user.id);
  const rankingItems = isInTop ? topRanking : [...topRanking, ownEntry];

  return (
    <section className="card profile-card">
      <ProfileHeader
        user={profile.user}
        isOwnProfile={false}
        ranking={profile.ranking}
      />

      <section className="profile-section">
        <h2>Información básica</h2>
        <p className="basic-info-bio">
          {profile.user.bio || 'Este jugador todavía no agregó una biografía.'}
        </p>
      </section>

      <section className="profile-section">
        <h2>Estadísticas</h2>
        <StatsGrid stats={profile.stats} />
      </section>

      <section className="profile-section">
        <h2>Ranking</h2>
        <p>
          Posición #{profile.ranking.position} de {profile.ranking.totalPlayers}{' '}
          jugadores
        </p>
        <RankingTable
          items={rankingItems}
          highlightUserId={profile.user.id}
          separatedUserId={isInTop ? undefined : profile.user.id}
        />
      </section>

      <section className="profile-section">
        <h2>Logros</h2>
        <AchievementsGrid achievements={profile.achievements} />
      </section>

      <section className="profile-section">
        <h2>Historial de partidas</h2>
        <MatchHistoryTable userId={profile.user.id} />
      </section>

      <p className="form-footer">
        <Link to="/profile">Volver a mi perfil</Link>
      </p>
    </section>
  );
}
