const { AppError } = require('../../shared/AppError');

class UsersController {
  constructor({ usersService, avatarService }) {
    this.usersService = usersService;
    this.avatarService = avatarService;
  }

  async listDefaults(req, res) {
    const avatars = await this.avatarService.listDefaults();

    return res.status(200).json({ avatars });
  }

  async getMyAvatars(req, res) {
    const options = await this.avatarService.getOptionsForUser(req.user.id);

    return res.status(200).json(options);
  }

  async selectAvatar(req, res) {
    const user = await this.avatarService.selectAvatar(
      req.user.id,
      req.body.avatarId
    );

    return res.status(200).json({ user });
  }

  async uploadAvatar(req, res) {
    const user = await this.avatarService.uploadAvatar(
      req.user.id,
      req.file.buffer
    );

    return res.status(201).json({ user });
  }

  async getPublicPlayer(req, res) {
    const player = await this.avatarService.getPublicPlayer(req.params.id);

    return res.status(200).json(player);
  }

  async getMyProfile(req, res) {
    const profile = await this.usersService.getProfile(
      req.user.id,
      req.user.id
    );

    return res.status(200).json(profile);
  }

  async getProfile(req, res) {
    const profile = await this.usersService.getProfile(
      req.params.id,
      req.user.id
    );

    return res.status(200).json(profile);
  }

  async updateMe(req, res) {
    const profile = await this.usersService.updateBasicInfo(
      req.user.id,
      req.body
    );

    return res.status(200).json(profile);
  }

  async getMatchHistory(req, res) {
    const history = await this.usersService.getMatchHistory(
      req.params.id,
      req.query
    );

    return res.status(200).json(history);
  }

  notImplemented(req, res, next) {
    return next(
      new AppError(501, 'NOT_IMPLEMENTED', 'Módulo de usuarios no implementado')
    );
  }
}

module.exports = { UsersController };
