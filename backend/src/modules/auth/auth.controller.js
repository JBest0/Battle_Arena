const { AppError } = require('../../shared/AppError');

class AuthController {
  constructor({ authService }) {
    this.authService = authService;
  }

  async register(req, res) {
    const { user, emailSent } = await this.authService.register(req.body);

    return res.status(201).json({
      message:
        'Cuenta creada. Revise su correo para verificar la cuenta antes de jugar.',
      user,
      emailSent,
    });
  }

  async login(req, res) {
    const { accessToken, user } = await this.authService.login(req.body);

    const body = { accessToken, user };

    if (!user.emailVerified) {
      body.notice = {
        code: 'EMAIL_NOT_VERIFIED',
        message:
          'Tu correo está pendiente de verificación. Podrás jugar cuando lo verifiques.',
      };
    }

    return res.status(200).json(body);
  }

  async me(req, res) {
    const user = await this.authService.getCurrentUser(req.user.id);

    return res.status(200).json({ user });
  }

  logout(req, res) {
    return res.status(204).send();
  }

  async verifyEmail(req, res) {
    const { alreadyVerified, user } = await this.authService.verifyEmail(
      req.body.token
    );

    return res.status(200).json({
      message: alreadyVerified
        ? 'Tu correo ya estaba verificado.'
        : 'Correo verificado. Ya puedes iniciar sesión y jugar.',
      alreadyVerified,
      user,
    });
  }

  async resendVerification(req, res) {
    const { message } = await this.authService.resendVerification(
      req.body.email
    );

    return res.status(200).json({ message });
  }

  async forgotPassword(req, res) {
    const { message } = await this.authService.requestPasswordReset(
      req.body.email
    );

    return res.status(200).json({ message });
  }

  async resetPassword(req, res) {
    const { message } = await this.authService.resetPassword(req.body);

    return res.status(200).json({ message });
  }

  notImplemented(req, res, next) {
    return next(
      new AppError(501, 'NOT_IMPLEMENTED', 'Módulo de autenticación no implementado')
    );
  }
}

module.exports = { AuthController };
