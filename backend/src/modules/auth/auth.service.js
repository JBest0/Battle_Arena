const bcrypt = require('bcrypt');
const { AppError } = require('../../shared/AppError');
const { generateToken, hashToken } = require('../../infrastructure/tokens');
const { signAccessToken } = require('../../infrastructure/jwt');

const EMAIL_TOKEN_TTL_HOURS = 24;
const RESEND_COOLDOWN_SECONDS = 60;
const BCRYPT_ROUNDS = 10;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;
const DUMMY_HASH =
  '$2b$10$MP9yLmn4ZRwiEfFM0h6w1.SvZ9rThq7fb6GniRi0Z95SUPIfroDx6';

function targetIncludes(target, field) {
  if (Array.isArray(target)) {
    return target.includes(field);
  }
  return typeof target === 'string' && target.toLowerCase().includes(field);
}

class AuthService {
  constructor({ userRepository, tokenRepository, emailService, unitOfWork }) {
    this.userRepository = userRepository;
    this.tokenRepository = tokenRepository;
    this.emailService = emailService;
    this.unitOfWork = unitOfWork;
  }

  async issueEmailVerification(user, tx) {
    const token = generateToken();
    const expiresAt = new Date(
      Date.now() + EMAIL_TOKEN_TTL_HOURS * 60 * 60 * 1000
    );

    await this.tokenRepository.createEmailVerification(
      user.id,
      hashToken(token),
      expiresAt,
      tx
    );

    return token;
  }

  async register(dto) {
    const existingUsername = await this.userRepository.findByUsername(dto.username);
    if (existingUsername) {
      throw new AppError(
        409,
        'USERNAME_TAKEN',
        'Ese nombre de usuario ya está en uso',
        { username: 'Ya existe una cuenta con este nombre de usuario' }
      );
    }

    const existingEmail = await this.userRepository.findByEmail(dto.email);
    if (existingEmail) {
      throw new AppError(
        409,
        'EMAIL_TAKEN',
        'Ese correo ya está asociado a otra cuenta',
        { email: 'Este correo ya está registrado' }
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    let user;
    let token;

    try {
      ({ user, token } = await this.unitOfWork.run(async (tx) => {
        const avatarId = await this.userRepository.getDefaultAvatarId(tx);

        const createdUser = await this.userRepository.createWithStats(
          {
            username: dto.username,
            email: dto.email,
            passwordHash,
            avatarId,
          },
          tx
        );

        const verificationToken = await this.issueEmailVerification(
          createdUser,
          tx
        );

        return { user: createdUser, token: verificationToken };
      }));
    } catch (err) {
      if (err && err.code === 'P2002') {
        if (targetIncludes(err.meta && err.meta.target, 'username')) {
          throw new AppError(
            409,
            'USERNAME_TAKEN',
            'Ese nombre de usuario ya está en uso',
            { username: 'Ya existe una cuenta con este nombre de usuario' }
          );
        }
        if (targetIncludes(err.meta && err.meta.target, 'email')) {
          throw new AppError(
            409,
            'EMAIL_TAKEN',
            'Ese correo ya está asociado a otra cuenta',
            { email: 'Este correo ya está registrado' }
          );
        }
      }
      throw err;
    }

    let emailSent = true;
    try {
      await this.emailService.sendVerification(user.email, token, user.username);
    } catch (err) {
      emailSent = false;
      console.error(
        `No se pudo enviar el correo de verificación a ${user.email}:`,
        err
      );
    }

    return {
      user: this.userRepository.toPublicUser(user),
      emailSent,
    };
  }

  async login({ identifier, password }) {
    const user = await this.userRepository.findByIdentifier(identifier);
    const passwordMatches = await bcrypt.compare(
      password,
      user ? user.passwordHash : DUMMY_HASH
    );

    if (!user || !passwordMatches) {
      throw new AppError(
        401,
        'INVALID_CREDENTIALS',
        'Usuario/correo o contraseña incorrectos'
      );
    }

    return {
      accessToken: signAccessToken(user),
      user: this.userRepository.toPublicUser(user),
    };
  }

  async getCurrentUser(userId) {
    const user = await this.userRepository.findByIdWithAvatar(userId);

    if (!user) {
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'Tu sesión ya no es válida. Inicia sesión de nuevo'
      );
    }

    return this.userRepository.toPublicUser(user);
  }

  async verifyEmail(token) {
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
      throw new AppError(
        400,
        'TOKEN_INVALID',
        'El enlace de verificación no es válido'
      );
    }

    const record = await this.tokenRepository.findEmailVerificationByHash(
      hashToken(token)
    );

    if (!record) {
      throw new AppError(
        400,
        'TOKEN_INVALID',
        'El enlace de verificación no es válido'
      );
    }

    if (record.user.emailVerified) {
      return {
        alreadyVerified: true,
        user: this.userRepository.toPublicUser(record.user),
      };
    }

    if (record.usedAt) {
      throw new AppError(
        400,
        'TOKEN_USED',
        'Este enlace ya fue utilizado. Solicita uno nuevo.'
      );
    }

    if (record.expiresAt < new Date()) {
      throw new AppError(
        410,
        'TOKEN_EXPIRED',
        'El enlace de verificación venció. Solicita uno nuevo.'
      );
    }

    const updatedUser = await this.unitOfWork.run(async (tx) => {
      await this.userRepository.markEmailVerified(record.userId, tx);
      await this.tokenRepository.markEmailVerificationUsed(record.id, tx);
      await this.tokenRepository.invalidateEmailVerifications(record.userId, tx);

      return this.userRepository.findById(record.userId, tx);
    });

    return {
      alreadyVerified: false,
      user: this.userRepository.toPublicUser(updatedUser),
    };
  }

  async resendVerification(email) {
    const user = await this.userRepository.findByEmail(email);

    if (!user || user.emailVerified) {
      return {
        message:
          'Si la cuenta existe y no está verificada, te enviamos un nuevo correo.',
      };
    }

    const latest = await this.tokenRepository.findLatestEmailVerification(
      user.id
    );

    if (
      latest &&
      Date.now() - latest.createdAt.getTime() <
        RESEND_COOLDOWN_SECONDS * 1000
    ) {
      throw new AppError(
        429,
        'TOO_MANY_REQUESTS',
        'Espera un minuto antes de pedir otro correo'
      );
    }

    const token = await this.unitOfWork.run(async (tx) => {
      await this.tokenRepository.invalidateEmailVerifications(user.id, tx);
      return this.issueEmailVerification(user, tx);
    });

    try {
      await this.emailService.sendVerification(user.email, token, user.username);
    } catch (err) {
      console.error(
        `No se pudo enviar el correo de verificación a ${user.email}:`,
        err
      );
      throw new AppError(
        502,
        'EMAIL_SEND_FAILED',
        'No pudimos enviar el correo. Intenta de nuevo más tarde'
      );
    }

    return {
      message:
        'Si la cuenta existe y no está verificada, te enviamos un nuevo correo.',
    };
  }
}

module.exports = {
  AuthService,
  EMAIL_TOKEN_TTL_HOURS,
  RESEND_COOLDOWN_SECONDS,
};
