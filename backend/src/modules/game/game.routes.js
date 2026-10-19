const express = require('express');
const { AppError } = require('../../shared/AppError');
const { asyncHandler } = require('../../shared/asyncHandler');
const { requireAuth } = require('../../shared/middleware/requireAuth');
const { requireVerifiedEmail } = require('../../shared/middleware/requireVerifiedEmail');

const router = express.Router();

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
