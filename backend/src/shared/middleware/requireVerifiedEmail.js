const { AppError } = require('../AppError');
const { UserRepository } = require('../../modules/users/user.repository');

function createRequireVerifiedEmail(userRepository) {
  return async function requireVerifiedEmail(req, res, next) {
    if (!req.user) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Debes iniciar sesión'));
    }

    try {
      const user = await userRepository.findById(req.user.id);

      if (!user) {
        return next(new AppError(401, 'UNAUTHORIZED', 'Debes iniciar sesión'));
      }

      const verified = await userRepository.isEmailVerified(req.user.id);

      if (!verified) {
        return next(
          new AppError(
            403,
            'EMAIL_NOT_VERIFIED',
            'Debes verificar tu correo antes de iniciar una partida'
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

const defaultUserRepository = new UserRepository();
const requireVerifiedEmail = createRequireVerifiedEmail(defaultUserRepository);

async function assertSocketUserVerified(payload, userRepository = defaultUserRepository) {
  if (!payload || !payload.id) {
    throw new AppError(401, 'UNAUTHORIZED', 'Debes iniciar sesión');
  }

  const verified = await userRepository.isEmailVerified(payload.id);

  if (!verified) {
    throw new AppError(
      403,
      'EMAIL_NOT_VERIFIED',
      'Debes verificar tu correo antes de iniciar una partida'
    );
  }

  return payload;
}

module.exports = {
  requireVerifiedEmail,
  createRequireVerifiedEmail,
  assertSocketUserVerified,
};
