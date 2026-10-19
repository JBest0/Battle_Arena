import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getErrorMessage, getMyProfile, getRanking } from '../api/profile';
import { useAuth } from '../auth/AuthContext';
import AvatarPicker from '../components/AvatarPicker';
import AchievementsGrid from '../components/profile/AchievementsGrid';
import BasicInfoEditor from '../components/profile/BasicInfoEditor';
import MatchHistoryTable from '../components/profile/MatchHistoryTable';
import ProfileHeader from '../components/profile/ProfileHeader';
import RankingTable from '../components/profile/RankingTable';
import StatsGrid from '../components/profile/StatsGrid';

const TOP_RANKING_LIMIT = 10;

function toRankingEntry(profile) {
  return {
    position: profile.ranking.position,
    userId: profile.user.id,
    username: profile.user.username,
    avatarUrl: profile.user.avatarUrl,
    rankingPoints: profile.stats.rankingPoints,
    gamesPlayed: profile.stats.gamesPlayed,
    gamesWon: profile.stats.gamesWon,
  };
}

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const location = useLocation();
  const notice = location.state?.notice;

  const [profile, setProfile] = useState(null);
  const [topRanking, setTopRanking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [profileData, rankingData] = await Promise.all([
        getMyProfile(),
        getRanking(TOP_RANKING_LIMIT),
      ]);
      setProfile(profileData);
      setTopRanking(rankingData.items);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaved(updatedProfile) {
    setProfile(updatedProfile);
    await refreshUser();
  }

  if (loading) {
    return (
      <section className="card profile-card">
        <p className="empty-state" role="status">
          Cargando tu perfil…
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

  const ownEntry = toRankingEntry(profile);
  const isInTop = topRanking.some((entry) => entry.userId === profile.user.id);
  const rankingItems = isInTop ? topRanking : [...topRanking, ownEntry];

  return (
    <section className="card profile-card">
      <ProfileHeader
        user={profile.user}
        isOwnProfile
        ranking={profile.ranking}
        notice={notice}
      />

      <section className="profile-section">
        <h2>Información básica</h2>
        <BasicInfoEditor user={profile.user} onSaved={handleSaved} />
      </section>

      <section className="profile-section">
        <h2>Tu avatar</h2>
        <AvatarPicker />
      </section>

      <section className="profile-section">
        <h2>Estadísticas</h2>
        <StatsGrid stats={profile.stats} />
      </section>

      <section className="profile-section" id="ranking">
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
        <MatchHistoryTable
          key={user?.id || profile.user.id}
          userId={profile.user.id}
          isOwnProfile
        />
      </section>
    </section>
  );
}
