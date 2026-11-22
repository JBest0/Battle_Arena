const path = require('path');
const { z } = require('zod');
const {
  EVENT_LIMITS,
  GUARDIAN_LIMITS,
  RANDOM_WALL_LIMITS,
} = require('./modules/game/game.config');

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
  // Carpeta con los archivos .json de escenarios (por defecto, src/scenarios).
  SCENARIOS_DIR: z.string().default(path.resolve(__dirname, 'scenarios')),
  // Eventos especiales: tiempo medio entre eventos y duración de cada uno (segundos).
  EVENT_INTERVAL_SECONDS: z.coerce
    .number()
    .int()
    .min(EVENT_LIMITS.intervalSeconds.min)
    .max(EVENT_LIMITS.intervalSeconds.max)
    .default(EVENT_LIMITS.intervalSeconds.default),
  EVENT_DURATION_SECONDS: z.coerce
    .number()
    .int()
    .min(EVENT_LIMITS.durationSeconds.min)
    .max(EVENT_LIMITS.durationSeconds.max)
    .default(EVENT_LIMITS.durationSeconds.default),
  // Paredes aleatorias: segundos entre un cambio y el siguiente.
  RANDOM_WALL_INTERVAL_SECONDS: z.coerce
    .number()
    .int()
    .min(RANDOM_WALL_LIMITS.intervalSeconds.min)
    .max(RANDOM_WALL_LIMITS.intervalSeconds.max)
    .default(RANDOM_WALL_LIMITS.intervalSeconds.default),
  // Guardianes: segundos que queda congelado un jugador al que alcanza uno.
  GUARDIAN_FREEZE_SECONDS: z.coerce
    .number()
    .min(GUARDIAN_LIMITS.freezeSeconds.min)
    .max(GUARDIAN_LIMITS.freezeSeconds.max)
    .default(GUARDIAN_LIMITS.freezeSeconds.default),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  OAUTH_REDIRECT_URI: z.string().url('OAUTH_REDIRECT_URI debe ser una URL válida').optional(),
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
  scenariosDir: env.SCENARIOS_DIR,
  eventIntervalSeconds: env.EVENT_INTERVAL_SECONDS,
  eventDurationSeconds: env.EVENT_DURATION_SECONDS,
  randomWallIntervalSeconds: env.RANDOM_WALL_INTERVAL_SECONDS,
  guardianFreezeSeconds: env.GUARDIAN_FREEZE_SECONDS,
  githubClientId: env.GITHUB_CLIENT_ID || '',
  githubClientSecret: env.GITHUB_CLIENT_SECRET || '',
  oauthRedirectUri: env.OAUTH_REDIRECT_URI || '',
  nodeEnv: process.env.NODE_ENV || 'development',
};
