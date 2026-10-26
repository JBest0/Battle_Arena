const express = require('express');
const { gameController } = require('../../container');
const { asyncHandler } = require('../../shared/asyncHandler');
const { validate } = require('../../shared/middleware/validate');
const { requireAuth } = require('../../shared/middleware/requireAuth');
const { requireVerifiedEmail } = require('../../shared/middleware/requireVerifiedEmail');
const { gameConfigSchema, matchIdParamsSchema } = require('./game.schemas');

const router = express.Router();

// Todas las rutas del juego exigen sesión y correo verificado (CA-02.5): no quitar
// requireAuth ni requireVerifiedEmail de ninguna.

// Configuración del juego: límites, valores por defecto y dimensiones de la arena.
router.get(
  '/options',
  requireAuth,
  requireVerifiedEmail,
  asyncHandler(gameController.getOptions.bind(gameController))
);

// Partidas en espera a las que el jugador se puede unir.
router.get(
  '/matches',
  requireAuth,
  requireVerifiedEmail,
  asyncHandler(gameController.listOpenMatches.bind(gameController))
);

// Crea una partida en espera con la configuración elegida en la sala de juego.
router.post(
  '/matches',
  requireAuth,
  requireVerifiedEmail,
  validate(gameConfigSchema),
  asyncHandler(gameController.createMatch.bind(gameController))
);

// Configuración y jugadores de una partida (la usan la sala de espera y la arena).
router.get(
  '/matches/:id',
  requireAuth,
  requireVerifiedEmail,
  validate(matchIdParamsSchema, 'params'),
  asyncHandler(gameController.getMatch.bind(gameController))
);

// El jugador entra a una partida en espera (si ya está dentro, responde igual).
router.post(
  '/matches/:id/join',
  requireAuth,
  requireVerifiedEmail,
  validate(matchIdParamsSchema, 'params'),
  asyncHandler(gameController.joinMatch.bind(gameController))
);

// El anfitrión inicia la partida: pasa de WAITING a IN_PROGRESS.
router.post(
  '/matches/:id/start',
  requireAuth,
  requireVerifiedEmail,
  validate(matchIdParamsSchema, 'params'),
  asyncHandler(gameController.startMatch.bind(gameController))
);

module.exports = { gameRouter: router };
