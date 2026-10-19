const { AppError } = require('../AppError');
const { verifyAccessToken } = require('../../infrastructure/jwt');

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

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Debes iniciar sesión'));
  }

  try {
    const payload = verifyAccessToken(token);
    if (!payload.sub) {
      throw new Error('Token sin subject');
    }
    req.user = { id: payload.sub, username: payload.username };
    return next();
  } catch (err) {
    return next(unauthorizedFor(err));
  }
}

function verifySocketToken(token) {
  try {
    const payload = verifyAccessToken(token);
    if (!payload.sub) {
      throw new Error('Token sin subject');
    }
    return { id: payload.sub, username: payload.username };
  } catch (err) {
    throw unauthorizedFor(err);
  }
}

module.exports = { requireAuth, verifySocketToken };
