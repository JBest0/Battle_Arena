const { AppError } = require('../../shared/AppError');

class UsersController {
  constructor({ usersService, avatarService }) {
    this.usersService = usersService;
    this.avatarService = avatarService;
  }

  notImplemented(req, res, next) {
    return next(
      new AppError(501, 'NOT_IMPLEMENTED', 'Módulo de usuarios no implementado')
    );
  }
}

module.exports = { UsersController };
