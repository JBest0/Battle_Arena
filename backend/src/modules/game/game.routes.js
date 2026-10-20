const express = require('express');
const { gameController } = require('../../container');
const { AppError } = require('../../shared/AppError');
const { asyncHandler } = require('../../shared/asyncHandler');
const { validate } = require('../../shared/middleware/validate');
const { requireAuth } = require('../../shared/middleware/requireAuth');
const { requireVerifiedEmail } = require('../../shared/middleware/requireVerifiedEmail');
const { gameConfigSchema, matchIdParamsSchema } = require('./game.schemas');

const router = express.Router();

// Configuración del juego: límites, valores por defecto y dimensiones de la arena.
router.get(
  '/options',
  requireAuth,
  requireVerifiedEmail,
  asyncHandler(gameController.getOptions.bind(gameController))
);

// Crea una partida en espera con la configuración elegida en la sala de juego.
router.post(
  '/matches',
  requireAuth,
  requireVerifiedEmail,
  validate(gameConfigSchema),
  asyncHandler(gameController.createMatch.bind(gameController))
);

// Configuración y jugadores de una partida (la usan la sala de juego y la arena).
router.get(
  '/matches/:id',
  requireAuth,
  requireVerifiedEmail,
  validate(matchIdParamsSchema, 'params'),
  asyncHandler(gameController.getMatch.bind(gameController))
);

// Módulo de partida: reemplazar el handler; NO quitar requireAuth ni requireVerifiedEmail (CA-02.5)
router.post(
  '/join',
  requireAuth,
  requireVerifiedEmail,
  asyncHandler(async (req, res, next) => {
    return next(
      new AppError(501, 'NOT_IMPLEMENTED', 'Módulo de partida no implementado')
    );
  })
);

module.exports = { gameRouter: router };
