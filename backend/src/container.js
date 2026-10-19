const config = require('./config');
const { EmailService } = require('./infrastructure/EmailService');
const { FileStorage } = require('./infrastructure/FileStorage');
const { UnitOfWork } = require('./infrastructure/UnitOfWork');
const { TokenCleanupJob } = require('./infrastructure/TokenCleanupJob');
const { AuthService } = require('./modules/auth/auth.service');
const { AuthController } = require('./modules/auth/auth.controller');
const { TokenRepository } = require('./modules/auth/token.repository');
const { UserRepository } = require('./modules/users/user.repository');
const { AvatarRepository } = require('./modules/users/avatar.repository');
const { UsersService } = require('./modules/users/users.service');
const { AvatarService } = require('./modules/users/avatar.service');
const { UsersController } = require('./modules/users/users.controller');
const { StatsRepository } = require('./modules/stats/stats.repository');
const { MatchRepository } = require('./modules/stats/match.repository');
const { StatsService } = require('./modules/stats/stats.service');
const { StatsController } = require('./modules/stats/stats.controller');
const {
  AchievementEvaluator,
} = require('./modules/stats/achievements/AchievementEvaluator');
const { rules } = require('./modules/stats/achievements/rules');

const userRepository = new UserRepository();
const avatarRepository = new AvatarRepository();
const tokenRepository = new TokenRepository();
const statsRepository = new StatsRepository();
const matchRepository = new MatchRepository();
const achievementEvaluator = new AchievementEvaluator(rules);
const emailService = new EmailService(config);
const fileStorage = new FileStorage(config);
const unitOfWork = new UnitOfWork();
const tokenCleanupJob = new TokenCleanupJob({ tokenRepository });

const authService = new AuthService({
  userRepository,
  tokenRepository,
  emailService,
  unitOfWork,
});

const usersService = new UsersService({ userRepository, statsRepository });
const avatarService = new AvatarService({
  avatarRepository,
  userRepository,
  fileStorage,
  unitOfWork,
});

const statsService = new StatsService({
  statsRepository,
  matchRepository,
  achievementEvaluator,
  unitOfWork,
});

const authController = new AuthController({ authService });
const usersController = new UsersController({ usersService, avatarService });
const statsController = new StatsController({ statsService });

module.exports = {
  config,
  userRepository,
  avatarRepository,
  tokenRepository,
  statsRepository,
  matchRepository,
  achievementEvaluator,
  emailService,
  fileStorage,
  unitOfWork,
  tokenCleanupJob,
  authService,
  usersService,
  avatarService,
  statsService,
  authController,
  usersController,
  statsController,
};
