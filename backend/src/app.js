const path = require('path');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const { prisma } = require('./infrastructure/prisma');
const { AppError } = require('./shared/AppError');
const { asyncHandler } = require('./shared/asyncHandler');
const { errorHandler } = require('./shared/middleware/errorHandler');
const { notFound } = require('./shared/middleware/notFound');
const { authRouter } = require('./modules/auth/auth.routes');
const { usersRouter, avatarsRouter } = require('./modules/users/users.routes');
const { gameRouter } = require('./modules/game/game.routes');

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get(
  '/api/health',
  asyncHandler(async (req, res, next) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      return next(
        new AppError(503, 'DB_UNAVAILABLE', 'Base de datos no disponible')
      );
    }

    return res.json({ status: 'ok', db: 'ok' });
  })
);

app.use('/static', express.static(path.join(__dirname, '..', 'public')));
// Los nombres de archivo son UUID, así que el contenido de una URL nunca cambia.
app.use(
  '/uploads',
  express.static(config.uploadsDir, { maxAge: '1y', immutable: true })
);

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/avatars', avatarsRouter);
app.use('/api/game', gameRouter);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
