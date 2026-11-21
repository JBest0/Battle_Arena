const express = require('express');
const { oauthController } = require('../../../container');
const { asyncHandler } = require('../../../shared/asyncHandler');

const router = express.Router();

router.get('/github', oauthController.githubStart.bind(oauthController));
router.get(
  '/github/callback',
  asyncHandler(oauthController.githubCallback.bind(oauthController))
);

module.exports = { oauthRouter: router };
