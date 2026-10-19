const { AppError } = require('../../shared/AppError');

const RECENT_MATCHES_LIMIT = 5;

function roundOneDecimal(value) {
  return Math.round(value * 10) / 10;
}

class UsersService {
  constructor({ userRepository, statsRepository }) {
    this.userRepository = userRepository;
    this.statsRepository = statsRepository;
  }

  async getProfile(targetUserId, viewerUserId) {
    const user = await this.userRepository.findProfileById(targetUserId);

    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'El jugador no existe');
    }

    let stats = user.stats;

    if (!stats) {
      console.warn(
        `El jugador ${targetUserId} no tenía PlayerStats; se crea en cero`
      );
      stats = await this.statsRepository.ensureStats(targetUserId);
    }

    const isOwnProfile = targetUserId === viewerUserId;

    const [counts, position, totalPlayers, achievements, history] =
      await Promise.all([
        this.statsRepository.getResultCounts(targetUserId),
        this.statsRepository.getRankingPosition(targetUserId),
        this.statsRepository.getTotalPlayers(),
        this.statsRepository.getAchievements(targetUserId),
        this.statsRepository.getMatchHistory(targetUserId, {
          page: 1,
          pageSize: RECENT_MATCHES_LIMIT,
        }),
      ]);

    const profileUser = {
      id: user.id,
      username: user.username,
      displayName: user.displayName ?? null,
      bio: user.bio ?? null,
      avatarUrl: user.avatar ? user.avatar.url : null,
      memberSince: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };

    if (isOwnProfile) {
      profileUser.email = user.email;
      profileUser.emailVerified = user.emailVerified;
    }

    const gamesPlayed = stats.gamesPlayed;

    return {
      user: profileUser,
      isOwnProfile,
      stats: {
        gamesPlayed,
        gamesWon: stats.gamesWon,
        gamesLost: counts.LOSS,
        gamesDrawn: counts.DRAW,
        winRate:
          gamesPlayed > 0
            ? roundOneDecimal((stats.gamesWon / gamesPlayed) * 100)
            : 0,
        totalPoints: stats.totalPoints,
        averagePoints:
          gamesPlayed > 0
            ? roundOneDecimal(stats.totalPoints / gamesPlayed)
            : 0,
        bestScore: stats.bestScore,
        rankingPoints: stats.rankingPoints,
      },
      ranking: { position, totalPlayers },
      achievements,
      recentMatches: { items: history.items, total: history.total },
    };
  }

  async updateBasicInfo(userId, dto) {
    await this.userRepository.updateBasicInfo(userId, dto);

    return this.getProfile(userId, userId);
  }

  getMatchHistory(userId, pagination) {
    return this.statsRepository.getMatchHistory(userId, pagination);
  }
}

module.exports = { UsersService };
