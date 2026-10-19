const { prisma } = require('./prisma');
const {
  TokenRepository,
} = require('../modules/auth/token.repository');

const ONE_HOUR_MS = 60 * 60 * 1000;
const RETENTION_DAYS = 7;

class TokenCleanupJob {
  constructor({
    tokenRepository = new TokenRepository(),
    intervalMs = ONE_HOUR_MS,
    retentionDays = RETENTION_DAYS,
    logger = console,
  } = {}) {
    this.tokenRepository = tokenRepository;
    this.intervalMs = intervalMs;
    this.retentionDays = retentionDays;
    this.logger = logger;
    this.timer = null;
  }

  async run() {
    const olderThan = new Date(
      Date.now() - this.retentionDays * 24 * 60 * 60 * 1000
    );
    const result = await this.tokenRepository.deleteExpiredTokens(olderThan);

    this.logger.log(
      `Limpieza de tokens: ${result.emailVerifications} de verificación y ${result.passwordResets} de recuperación eliminados`
    );

    return result;
  }

  start(intervalMs = this.intervalMs) {
    if (this.timer) {
      return this.timer;
    }

    this.intervalMs = intervalMs;
    this.timer = setInterval(() => {
      this.run().catch((err) => {
        this.logger.error('Error al limpiar tokens:', err);
      });
    }, intervalMs);

    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }

    return this.timer;
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

if (require.main === module) {
  const job = new TokenCleanupJob();

  job
    .run()
    .catch((err) => {
      console.error('Error al limpiar tokens:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = { TokenCleanupJob, ONE_HOUR_MS, RETENTION_DAYS };
