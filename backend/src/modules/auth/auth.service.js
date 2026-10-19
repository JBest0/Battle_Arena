const bcrypt = require('bcrypt');
const { AppError } = require('../../shared/AppError');
const { generateToken, hashToken } = require('../../infrastructure/tokens');

const EMAIL_TOKEN_TTL_HOURS = 24;
const BCRYPT_ROUNDS = 10;

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
    const token = generateToken();
    const expiresAt = new Date(
      Date.now() + EMAIL_TOKEN_TTL_HOURS * 60 * 60 * 1000
    );

    let user;

    try {
      user = await this.unitOfWork.run(async (tx) => {
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

        await this.tokenRepository.createEmailVerification(
          createdUser.id,
          hashToken(token),
          expiresAt,
          tx
        );

        return createdUser;
      });
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
}

module.exports = { AuthService, EMAIL_TOKEN_TTL_HOURS };
