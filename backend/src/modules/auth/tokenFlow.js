const { generateToken, hashToken } = require('../../infrastructure/tokens');

const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

function isValidTokenFormat(token) {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

function getTokenStatus(record, now = new Date()) {
  if (!record) {
    return 'invalid';
  }
  if (record.usedAt) {
    return 'used';
  }
  if (record.expiresAt <= now) {
    return 'expired';
  }
  return 'valid';
}

async function issueToken(create, ttlMs) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlMs);

  await create(hashToken(token), expiresAt);

  return token;
}

module.exports = {
  TOKEN_PATTERN,
  isValidTokenFormat,
  getTokenStatus,
  issueToken,
};
