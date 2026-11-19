const crypto = require('crypto');
const { AppError } = require('../../../shared/AppError');
const { signAccessToken } = require('../../../infrastructure/jwt');

const PROVIDER = 'github';

function cleanGithubUsername(login) {
  let username = String(login || '')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 30);

  if (username.length < 3) username = `github_${username || 'user'}`.slice(0, 30);
  return username;
}

class OauthService {
  constructor({
    provider,
    externalIdentityRepository,
    userRepository,
    unitOfWork,
    authService,
  }) {
    this.provider = provider;
    this.externalIdentityRepository = externalIdentityRepository;
    this.userRepository = userRepository;
    this.unitOfWork = unitOfWork;
    this.authService = authService;
  }

  createState() {
    return crypto.randomBytes(32).toString('hex');
  }

  getAuthUrl(state) {
    return this.provider.getAuthUrl(state);
  }

  async loginWithCode(code) {
    const profile = await this.provider.getProfile(code);
    if (!profile.email) {
      throw new AppError(
        400,
        'EMAIL_NOT_VERIFIED',
        'GitHub no proporcionó un correo principal verificado'
      );
    }

    const email = profile.email.trim().toLowerCase();
    const user = await this.unitOfWork.run(async (tx) => {
      const identity = await this.externalIdentityRepository.find(
        PROVIDER,
        profile.providerUserId,
        tx
      );
      if (identity) {
        await this.userRepository.touchLastLogin(identity.userId, tx);
        return this.userRepository.findByIdWithAvatar(identity.userId, tx);
      }

      let existing = await this.userRepository.findByEmail(email, tx);
      if (existing && !existing.emailVerified) {
        throw new AppError(
          400,
          'EMAIL_NOT_VERIFIED',
          'El correo de esta cuenta todavía no está verificado'
        );
      }
      if (existing) {
        await this.externalIdentityRepository.create(
          {
            userId: existing.id,
            provider: PROVIDER,
            providerUserId: profile.providerUserId,
          },
          tx
        );
        await this.userRepository.touchLastLogin(existing.id, tx);
        return this.userRepository.findByIdWithAvatar(existing.id, tx);
      }

      let username = cleanGithubUsername(profile.login);
      for (let suffix = 1; await this.userRepository.findByUsername(username, tx); suffix++) {
        const base = cleanGithubUsername(profile.login).slice(0, 30 - String(suffix).length - 1);
        username = `${base}_${suffix}`;
      }

      const created = await this.authService.createUserWithDefaults(
        {
          username,
          email,
          passwordHash: null,
          emailVerified: true,
        },
        tx
      );
      await this.externalIdentityRepository.create(
        {
          userId: created.id,
          provider: PROVIDER,
          providerUserId: profile.providerUserId,
        },
        tx
      );
      await this.userRepository.touchLastLogin(created.id, tx);
      return this.userRepository.findByIdWithAvatar(created.id, tx);
    });

    return {
      accessToken: signAccessToken(user),
      user: this.userRepository.toPublicUser(user),
    };
  }
}

module.exports = { OauthService, cleanGithubUsername };
