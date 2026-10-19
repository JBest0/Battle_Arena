const bcrypt = require('bcrypt');
const { AppError } = require('../../shared/AppError');
const { hashToken } = require('../../infrastructure/tokens');
const { signAccessToken } = require('../../infrastructure/jwt');
const {
  isValidTokenFormat,
  getTokenStatus,
  issueToken,
} = require('./tokenFlow');

const EMAIL_TOKEN_TTL_HOURS = 24;
const RESET_TOKEN_TTL_MINUTES = 30;
const RESEND_COOLDOWN_SECONDS = 60;
const BCRYPT_ROUNDS = 10;
const DUMMY_HASH =
  '$2b$10$MP9yLmn4ZRwiEfFM0h6w1.SvZ9rThq7fb6GniRi0Z95SUPIfroDx6';
const GENERIC_RESET_MESSAGE =
  'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña. Vence en 30 minutos.';

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
    return issueToken(
      (tokenHash, expiresAt) =>
        this.tokenRepository.createEmailVerification(
          user.id,
          tokenHash,
          expiresAt,
          tx
        ),
      EMAIL_TOKEN_TTL_HOURS * 60 * 60 * 1000
    );
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

    await this.userRepository.touchLastLogin(user.id);

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
    if (!isValidTokenFormat(token)) {
      throw new AppError(
        400,
        'TOKEN_INVALID',
        'El enlace de verificación no es válido'
      );
    }

    const record = await this.tokenRepository.findEmailVerificationByHash(
      hashToken(token)
    );

    const status = getTokenStatus(record);

    if (status === 'invalid') {
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

    if (status === 'used') {
      throw new AppError(
        400,
        'TOKEN_USED',
        'Este enlace ya fue utilizado. Solicita uno nuevo.'
      );
    }

    if (status === 'expired') {
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

  async requestPasswordReset(email) {
    const response = { message: GENERIC_RESET_MESSAGE };
    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      return response;
    }

    const latest = await this.tokenRepository.findLatestPasswordReset(user.id);

    if (
      latest &&
      Date.now() - latest.createdAt.getTime() <
        RESEND_COOLDOWN_SECONDS * 1000
    ) {
      throw new AppError(
        429,
        'TOO_MANY_REQUESTS',
        'Espera un minuto antes de pedir otro enlace'
      );
    }

    const token = await this.unitOfWork.run(async (tx) => {
      await this.tokenRepository.invalidatePasswordResets(user.id, tx);

      return issueToken(
        (tokenHash, expiresAt) =>
          this.tokenRepository.createPasswordReset(
            user.id,
            tokenHash,
            expiresAt,
            tx
          ),
        RESET_TOKEN_TTL_MINUTES * 60 * 1000
      );
    });

    try {
      await this.emailService.sendPasswordReset(
        user.email,
        token,
        user.username
      );
    } catch (err) {
      console.error(
        `No se pudo enviar el correo de recuperación a ${user.email}:`,
        err
      );
      throw new AppError(
        502,
        'EMAIL_SEND_FAILED',
        'No pudimos enviar el correo. Intenta de nuevo más tarde'
      );
    }

    return response;
  }

  async resetPassword({ token, password }) {
    if (!isValidTokenFormat(token)) {
      throw new AppError(
        400,
        'TOKEN_INVALID',
        'El enlace de recuperación no es válido'
      );
    }

    const record = await this.tokenRepository.findPasswordResetByHash(
      hashToken(token)
    );
    const status = getTokenStatus(record);

    if (status === 'invalid') {
      throw new AppError(
        400,
        'TOKEN_INVALID',
        'El enlace de recuperación no es válido'
      );
    }

    if (status === 'used') {
      throw new AppError(
        400,
        'TOKEN_USED',
        'Este enlace ya fue utilizado. Solicita uno nuevo'
      );
    }

    if (status === 'expired') {
      throw new AppError(
        410,
        'TOKEN_EXPIRED',
        'El enlace de recuperación venció. Solicita uno nuevo'
      );
    }

    if (await bcrypt.compare(password, record.user.passwordHash)) {
      throw new AppError(
        400,
        'PASSWORD_REUSED',
        'La nueva contraseña debe ser distinta a la actual',
        { password: 'La nueva contraseña debe ser distinta a la actual' }
      );
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await this.unitOfWork.run(async (tx) => {
      await this.userRepository.updatePassword(
        record.userId,
        passwordHash,
        tx
      );
      await this.tokenRepository.markPasswordResetUsed(record.id, tx);
      await this.tokenRepository.invalidatePasswordResets(record.userId, tx);
    });

    try {
      await this.emailService.sendPasswordChanged(
        record.user.email,
        record.user.username
      );
    } catch (err) {
      console.error(
        `No se pudo enviar el aviso de cambio de contraseña a ${record.user.email}:`,
        err
      );
    }

    return { message: 'Contraseña actualizada. Ya puedes iniciar sesión.' };
  }
}

module.exports = {
  AuthService,
  EMAIL_TOKEN_TTL_HOURS,
  RESET_TOKEN_TTL_MINUTES,
  RESEND_COOLDOWN_SECONDS,
  GENERIC_RESET_MESSAGE,
};
