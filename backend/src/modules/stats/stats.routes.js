const express = require('express');
const { statsController } = require('../../container');
const { asyncHandler } = require('../../shared/asyncHandler');
const { validate } = require('../../shared/middleware/validate');
const { requireAuth } = require('../../shared/middleware/requireAuth');
const { rankingQuerySchema } = require('../users/users.schemas');

const rankingRouter = express.Router();

rankingRouter.get(
  '/',
  requireAuth,
  validate(rankingQuerySchema, 'query'),
  asyncHandler(statsController.getRanking.bind(statsController))
);

module.exports = { rankingRouter };
