const { prisma } = require('../../infrastructure/prisma');

const POINTS_BY_RESULT = { WIN: 3, DRAW: 1, LOSS: 0 };

class StatsRepository {
  constructor(db = prisma) {
    this.db = db;
  }

  getStats(userId, tx = this.db) {
    return tx.playerStats.findUnique({ where: { userId } });
  }

  async ensureStats(userId, tx = this.db) {
    return tx.playerStats.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  // ROW_NUMBER() permite obtener la posición con una sola consulta y sin
  // cargar todos los jugadores en memoria; el desempate replica el del ranking.
  async getRankingPosition(userId, tx = this.db) {
    const rows = await tx.$queryRaw`
      WITH ranked AS (
        SELECT
          u.id,
          (ROW_NUMBER() OVER (
            ORDER BY
              COALESCE(ps.ranking_points, 0) DESC,
              COALESCE(ps.games_won, 0) DESC,
              u.username ASC
          ))::int AS position
        FROM "users" u
        LEFT JOIN "player_stats" ps ON ps.user_id = u.id
      )
      SELECT position FROM ranked WHERE id = ${userId}::uuid
    `;

    return rows.length > 0 ? rows[0].position : null;
  }

  getTotalPlayers(tx = this.db) {
    return tx.user.count();
  }

  async getTopRanking(limit, tx = this.db) {
    return tx.$queryRaw`
      SELECT
        u.id AS "userId",
        u.username,
        a.url AS "avatarUrl",
        COALESCE(ps.ranking_points, 0)::int AS "rankingPoints",
        COALESCE(ps.games_played, 0)::int AS "gamesPlayed",
        COALESCE(ps.games_won, 0)::int AS "gamesWon",
        (ROW_NUMBER() OVER (
          ORDER BY
            COALESCE(ps.ranking_points, 0) DESC,
            COALESCE(ps.games_won, 0) DESC,
            u.username ASC
        ))::int AS position
      FROM "users" u
      LEFT JOIN "player_stats" ps ON ps.user_id = u.id
      LEFT JOIN "avatars" a ON a.id = u.avatar_id
      ORDER BY position ASC
      LIMIT ${limit}
    `;
  }

  async getResultCounts(userId, tx = this.db) {
    const rows = await tx.matchParticipant.groupBy({
      by: ['result'],
      where: { userId, result: { not: null } },
      _count: { _all: true },
    });

    const counts = { WIN: 0, LOSS: 0, DRAW: 0 };

    for (const row of rows) {
      if (row.result && counts[row.result] !== undefined) {
        counts[row.result] = row._count._all;
      }
    }

    return counts;
  }

  async getMatchHistory(userId, { page = 1, pageSize = 10 }, tx = this.db) {
    const where = { userId, match: { endedAt: { not: null } } };

    const [total, rows] = await Promise.all([
      tx.matchParticipant.count({ where }),
      tx.matchParticipant.findMany({
        where,
        orderBy: { match: { endedAt: 'desc' } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          match: {
            include: {
              participants: {
                include: { user: { include: { avatar: true } } },
              },
            },
          },
        },
      }),
    ]);

    const items = rows.map((row) => {
      const { match } = row;
      const durationSeconds =
        match.startedAt && match.endedAt
          ? Math.max(
              0,
              Math.round(
                (match.endedAt.getTime() - match.startedAt.getTime()) / 1000
              )
            )
          : null;

      return {
        matchId: match.id,
        startedAt: match.startedAt,
        endedAt: match.endedAt,
        durationSeconds,
        endMode: match.endMode,
        result: row.result,
        finalScore: row.finalScore,
        position: row.position,
        opponents: match.participants
          .filter((participant) => participant.userId !== userId)
          .map((participant) => ({
            id: participant.userId,
            username: participant.user.username,
            avatarUrl: participant.user.avatar
              ? participant.user.avatar.url
              : null,
            finalScore: participant.finalScore,
          })),
      };
    });

    return { items, total, page, pageSize };
  }

  async getAchievements(userId, tx = this.db) {
    const achievements = await tx.achievement.findMany({
      orderBy: { code: 'asc' },
      include: {
        users: {
          where: { userId },
          select: { unlockedAt: true },
        },
      },
    });

    return achievements.map((achievement) => {
      const unlock = achievement.users[0];

      return {
        code: achievement.code,
        name: achievement.name,
        description: achievement.description,
        icon: achievement.icon,
        unlocked: Boolean(unlock),
        unlockedAt: unlock ? unlock.unlockedAt : null,
      };
    });
  }

  async applyMatchResult(tx, { userId, result, score }) {
    const current = await tx.playerStats.findUnique({ where: { userId } });
    const increment = {
      gamesPlayed: 1,
      gamesWon: result === 'WIN' ? 1 : 0,
      totalPoints: score,
      rankingPoints: POINTS_BY_RESULT[result] || 0,
    };

    if (!current) {
      return tx.playerStats.create({
        data: {
          userId,
          ...increment,
          bestScore: score,
        },
      });
    }

    return tx.playerStats.update({
      where: { userId },
      data: {
        gamesPlayed: { increment: increment.gamesPlayed },
        gamesWon: { increment: increment.gamesWon },
        totalPoints: { increment: increment.totalPoints },
        rankingPoints: { increment: increment.rankingPoints },
        bestScore: Math.max(current.bestScore, score),
      },
    });
  }

  async unlockAchievements(tx, userId, codes) {
    if (codes.length === 0) {
      return { count: 0 };
    }

    const achievements = await tx.achievement.findMany({
      where: { code: { in: codes } },
      select: { id: true },
    });

    return tx.userAchievement.createMany({
      data: achievements.map((achievement) => ({
        userId,
        achievementId: achievement.id,
      })),
      skipDuplicates: true,
    });
  }
}

module.exports = { StatsRepository, POINTS_BY_RESULT };
