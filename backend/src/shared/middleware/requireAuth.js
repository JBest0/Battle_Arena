const jwt = require('jsonwebtoken');
const config = require('../../config');
const { AppError } = require('../AppError');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Debe iniciar sesión'));
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (!payload.sub) {
      throw new Error('Token sin subject');
    }
    req.user = { id: payload.sub, username: payload.username };
    return next();
  } catch (err) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Debe iniciar sesión'));
  }
}

function verifySocketToken(token) {
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (!payload.sub) {
      throw new Error('Token sin subject');
    }
    return { id: payload.sub, username: payload.username };
  } catch (err) {
    throw new AppError(401, 'UNAUTHORIZED', 'Debe iniciar sesión');
  }
}

module.exports = { requireAuth, verifySocketToken };
