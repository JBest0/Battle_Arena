const express = require('express');
const { matchesController } = require('../../container');
const { asyncHandler } = require('../../shared/asyncHandler');
const { validate } = require('../../shared/middleware/validate');
const { requireAuth } = require('../../shared/middleware/requireAuth');
const {
  requireVerifiedEmail,
} = require('../../shared/middleware/requireVerifiedEmail');
const { matchIdParamsSchema } = require('./matches.schemas');

const router = express.Router();

router.get(
  '/:id/result',
  requireAuth,
  requireVerifiedEmail,
  validate(matchIdParamsSchema, 'params'),
  asyncHandler(matchesController.getResult.bind(matchesController))
);

module.exports = { matchesRouter: router };
