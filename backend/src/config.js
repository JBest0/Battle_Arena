const path = require('path');
const { z } = require('zod');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatorio'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET es obligatorio'),
  JWT_EXPIRES_IN: z.string().min(1).default('8h'),
  FRONTEND_URL: z.string().url('FRONTEND_URL debe ser una URL válida'),
  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN es obligatorio'),
  SMTP_HOST: z.string().min(1, 'SMTP_HOST es obligatorio'),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().min(1, 'MAIL_FROM es obligatorio'),
  UPLOADS_DIR: z.string().min(1, 'UPLOADS_DIR es obligatorio'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  console.error(`Configuración inválida:\n${details}`);
  process.exit(1);
}

const env = parsed.data;

module.exports = {
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  frontendUrl: env.FRONTEND_URL,
  corsOrigin: env.CORS_ORIGIN,
  smtpHost: env.SMTP_HOST,
  smtpPort: env.SMTP_PORT,
  smtpUser: env.SMTP_USER,
  smtpPass: env.SMTP_PASS,
  mailFrom: env.MAIL_FROM,
  uploadsDir: env.UPLOADS_DIR,
  nodeEnv: process.env.NODE_ENV || 'development',
};
