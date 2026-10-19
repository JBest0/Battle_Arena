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

  async sendPasswordReset(to, token) {
    const link = `${this.frontendUrl}/reset?token=${encodeURIComponent(token)}`;

    return this.transporter.sendMail({
      from: this.mailFrom,
      to,
      subject: 'Recuperación de contraseña - Battle Arena',
      html: `
        <h1>Recupera tu contraseña</h1>
        <p>Recibimos una solicitud para restablecer tu contraseña.</p>
        <p><a href="${link}">Crear una nueva contraseña</a></p>
        <p>Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
      `,
    });
  }
}

module.exports = { EmailService };
