const { AppError } = require('../AppError');
const { UserRepository } = require('../../modules/users/user.repository');

function createRequireVerifiedEmail(userRepository) {
  return async function requireVerifiedEmail(req, res, next) {
    if (!req.user) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Debe iniciar sesión'));
    }

    try {
      const user = await userRepository.findById(req.user.id);

      if (!user) {
        return next(new AppError(401, 'UNAUTHORIZED', 'Debe iniciar sesión'));
      }

      if (!user.emailVerified) {
        return next(
          new AppError(
            403,
            'EMAIL_NOT_VERIFIED',
            'Debe verificar su correo para jugar'
          )
        );
      }

      req.currentUser = user;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

const requireVerifiedEmail = createRequireVerifiedEmail(new UserRepository());

module.exports = { requireVerifiedEmail, createRequireVerifiedEmail };
