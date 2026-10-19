const nodemailer = require('nodemailer');
const config = require('../config');

class EmailService {
  constructor(options = config) {
    this.frontendUrl = options.frontendUrl;
    this.mailFrom = options.mailFrom;

    const auth = options.smtpUser
      ? { user: options.smtpUser, pass: options.smtpPass }
      : undefined;

    this.transporter = nodemailer.createTransport({
      host: options.smtpHost,
      port: options.smtpPort,
      secure: false,
      auth,
    });
  }

  async sendVerification(to, token, username) {
    const link = `${this.frontendUrl}/verify?token=${encodeURIComponent(token)}`;
    const greeting = username ? `Hola ${username},` : 'Hola,';

    return this.transporter.sendMail({
      from: this.mailFrom,
      to,
      subject: 'Verifica tu cuenta de Battle Arena',
      text: [
        'Bienvenido a Battle Arena',
        '',
        greeting,
        '',
        'Gracias por registrarte. Para activar tu cuenta, abre el siguiente enlace:',
        link,
        '',
        'El enlace vence en 24 horas.',
        'Si no creaste esta cuenta, puedes ignorar este mensaje.',
      ].join('\n'),
      html: `
        <h1>Bienvenido a Battle Arena</h1>
        <p>${greeting}</p>
        <p>Gracias por registrarte. Para activar tu cuenta, haz clic en el siguiente enlace:</p>
        <p><a href="${link}">Verificar mi correo</a></p>
        <p>Si el botón no funciona, copia este enlace en tu navegador:<br>${link}</p>
        <p>El enlace vence en 24 horas.</p>
        <p>Si no creaste esta cuenta, puedes ignorar este mensaje.</p>
      `,
    });
  }

  async sendPasswordReset(to, token, username) {
    const link = `${this.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const greeting = username ? `Hola ${username},` : 'Hola,';

    return this.transporter.sendMail({
      from: this.mailFrom,
      to,
      subject: 'Restablece tu contraseña de Battle Arena',
      text: [
        'Battle Arena',
        '',
        greeting,
        '',
        'Recibimos una solicitud para restablecer tu contraseña. Abre el siguiente enlace:',
        link,
        '',
        'El enlace vence en 30 minutos y solo se puede usar una vez.',
        'Si no lo solicitaste, ignora este correo.',
      ].join('\n'),
      html: `
        <h1>Restablece tu contraseña</h1>
        <p>${greeting}</p>
        <p>Recibimos una solicitud para restablecer tu contraseña. Haz clic en el siguiente enlace:</p>
        <p><a href="${link}">Restablecer mi contraseña</a></p>
        <p>Si el botón no funciona, copia este enlace en tu navegador:<br>${link}</p>
        <p>El enlace vence en 30 minutos y solo se puede usar una vez.</p>
        <p>Si no lo solicitaste, ignora este correo.</p>
      `,
    });
  }

  async sendPasswordChanged(to, username) {
    const greeting = username ? `Hola ${username},` : 'Hola,';

    return this.transporter.sendMail({
      from: this.mailFrom,
      to,
      subject: 'Tu contraseña de Battle Arena cambió',
      text: [
        greeting,
        '',
        'La contraseña de tu cuenta de Battle Arena se cambió correctamente.',
        'Todas las sesiones abiertas se cerraron.',
        'Si no hiciste este cambio, solicita un nuevo enlace de recuperación de inmediato.',
      ].join('\n'),
      html: `
        <h1>Tu contraseña cambió</h1>
        <p>${greeting}</p>
        <p>La contraseña de tu cuenta de Battle Arena se cambió correctamente.</p>
        <p>Todas las sesiones abiertas se cerraron.</p>
        <p>Si no hiciste este cambio, solicita un nuevo enlace de recuperación de inmediato.</p>
      `,
    });
  }
}

module.exports = { EmailService };
