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

  notImplemented(req, res, next) {
    return next(
      new AppError(501, 'NOT_IMPLEMENTED', 'Módulo de autenticación no implementado')
    );
  }
}

module.exports = { AuthController };
