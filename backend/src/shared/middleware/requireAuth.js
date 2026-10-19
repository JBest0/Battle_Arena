const { AppError } = require('../AppError');
const { verifyAccessToken } = require('../../infrastructure/jwt');
const { UserRepository } = require('../../modules/users/user.repository');

const defaultUserRepository = new UserRepository();

function unauthorizedFor(err) {
  if (err && err.name === 'TokenExpiredError') {
    return new AppError(
      401,
      'TOKEN_EXPIRED_SESSION',
      'Tu sesión expiró. Inicia sesión de nuevo'
    );
  }

  return new AppError(401, 'UNAUTHORIZED', 'Debes iniciar sesión');
}

function sessionRevoked() {
  return new AppError(
    401,
    'SESSION_REVOKED',
    'Tu contraseña cambió. Inicia sesión de nuevo'
  );
}

async function assertSessionIsCurrent(payload, userRepository) {
  const passwordChangedAt = await userRepository.getPasswordChangedAt(
    payload.sub
  );

  if (
    passwordChangedAt &&
    typeof payload.iat === 'number' &&
    payload.iat < Math.floor(passwordChangedAt.getTime() / 1000)
  ) {
    throw sessionRevoked();
  }
}

function createRequireAuth(userRepository) {
  return async function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Debes iniciar sesión'));
    }

    let payload;

    try {
      payload = verifyAccessToken(token);
      if (!payload.sub) {
        throw new Error('Token sin subject');
      }
    } catch (err) {
      return next(unauthorizedFor(err));
    }

    try {
      await assertSessionIsCurrent(payload, userRepository);
    } catch (err) {
      return next(err);
    }

    req.user = { id: payload.sub, username: payload.username };
    return next();
  };
}

async function verifySocketToken(token, userRepository = defaultUserRepository) {
  let payload;

  try {
    payload = verifyAccessToken(token);
    if (!payload.sub) {
      throw new Error('Token sin subject');
    }
  } catch (err) {
    throw unauthorizedFor(err);
  }

  await assertSessionIsCurrent(payload, userRepository);

  return { id: payload.sub, username: payload.username };
}

const requireAuth = createRequireAuth(defaultUserRepository);

module.exports = { requireAuth, createRequireAuth, verifySocketToken };
