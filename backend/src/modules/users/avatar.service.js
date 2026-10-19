const { AppError } = require('../../shared/AppError');

const MIN_DEFAULT_AVATARS = 5;

class AvatarService {
  constructor({ avatarRepository, userRepository, fileStorage, unitOfWork }) {
    this.avatarRepository = avatarRepository;
    this.userRepository = userRepository;
    this.fileStorage = fileStorage;
    this.unitOfWork = unitOfWork;
  }

  async listDefaults() {
    const avatars = await this.avatarRepository.findDefaults();

    if (avatars.length < MIN_DEFAULT_AVATARS) {
      console.error(
        `Configuración inválida: se esperaban al menos ${MIN_DEFAULT_AVATARS} avatares DEFAULT y hay ${avatars.length}`
      );
      throw new AppError(
        500,
        'CONFIG_ERROR',
        'No hay suficientes avatares predeterminados configurados'
      );
    }

    return avatars;
  }

  async getOptionsForUser(userId) {
    const user = await this.userRepository.findByIdWithAvatar(userId);

    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'El jugador no existe');
    }

    const [defaults, uploaded] = await Promise.all([
      this.avatarRepository.findDefaults(),
      this.avatarRepository.findUploadedByOwner(userId),
    ]);

    return {
      currentAvatarId: user.avatarId,
      defaults,
      uploaded: uploaded ? { id: uploaded.id, url: uploaded.url } : null,
    };
  }

  async selectAvatar(userId, avatarId) {
    const avatar = await this.avatarRepository.findById(avatarId);

    if (
      !avatar ||
      (avatar.type === 'UPLOADED' && avatar.ownerId !== userId)
    ) {
      throw new AppError(
        404,
        'AVATAR_NOT_FOUND',
        'El avatar seleccionado no existe'
      );
    }

    const user = await this.userRepository.updateAvatar(userId, avatar.id);

    return this.userRepository.toPublicUser(user);
  }

  async uploadAvatar(userId, buffer) {
    const saved = await this.fileStorage.saveAvatar(buffer);
    let previous = null;

    try {
      const user = await this.unitOfWork.run(async (tx) => {
        previous = await this.avatarRepository.findUploadedByOwner(userId, tx);
        const created = await this.avatarRepository.createUploaded(
          { url: saved.url, ownerId: userId },
          tx
        );
        const updated = await this.userRepository.updateAvatar(
          userId,
          created.id,
          tx
        );

        if (previous) {
          await this.avatarRepository.delete(previous.id, tx);
        }

        return updated;
      });

      if (previous) {
        await this.fileStorage.deleteAvatarFile(previous.url);
      }

      return this.userRepository.toPublicUser(user);
    } catch (err) {
      await this.fileStorage.deleteAvatarFile(saved.url);
      throw err;
    }
  }

  async getPublicPlayer(userId) {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'El jugador no existe');
    }

    return {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatar ? user.avatar.url : null,
    };
  }
}

module.exports = { AvatarService };
