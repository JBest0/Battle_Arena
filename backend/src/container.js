const config = require('./config');
const { EmailService } = require('./infrastructure/EmailService');
const { FileStorage } = require('./infrastructure/FileStorage');
const { UnitOfWork } = require('./infrastructure/UnitOfWork');
const { AuthService } = require('./modules/auth/auth.service');
const { AuthController } = require('./modules/auth/auth.controller');
const { TokenRepository } = require('./modules/auth/token.repository');
const { UserRepository } = require('./modules/users/user.repository');
const { AvatarRepository } = require('./modules/users/avatar.repository');
const { UsersService } = require('./modules/users/users.service');
const { AvatarService } = require('./modules/users/avatar.service');
const { UsersController } = require('./modules/users/users.controller');

const userRepository = new UserRepository();
const avatarRepository = new AvatarRepository();
const tokenRepository = new TokenRepository();
const emailService = new EmailService(config);
const fileStorage = new FileStorage(config);
const unitOfWork = new UnitOfWork();

const authService = new AuthService({
  userRepository,
  tokenRepository,
  emailService,
  unitOfWork,
});

const usersService = new UsersService({ userRepository });
const avatarService = new AvatarService({
  avatarRepository,
  userRepository,
  fileStorage,
  unitOfWork,
});

const authController = new AuthController({ authService });
const usersController = new UsersController({ usersService, avatarService });

module.exports = {
  config,
  userRepository,
  avatarRepository,
  tokenRepository,
  emailService,
  fileStorage,
  unitOfWork,
  authService,
  usersService,
  avatarService,
  authController,
  usersController,
};
