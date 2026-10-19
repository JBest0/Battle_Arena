const express = require('express');
const { usersController } = require('../../container');
const { asyncHandler } = require('../../shared/asyncHandler');
const { validate } = require('../../shared/middleware/validate');
const { requireAuth } = require('../../shared/middleware/requireAuth');
const {
  uploadAvatarMiddleware,
} = require('../../infrastructure/FileStorage');
const { avatarSelectionSchema } = require('./users.schemas');

const usersRouter = express.Router();
const avatarsRouter = express.Router();

avatarsRouter.get(
  '/defaults',
  asyncHandler(usersController.listDefaults.bind(usersController))
);

usersRouter.get(
  '/me/avatars',
  requireAuth,
  asyncHandler(usersController.getMyAvatars.bind(usersController))
);

usersRouter.put(
  '/me/avatar',
  requireAuth,
  validate(avatarSelectionSchema),
  asyncHandler(usersController.selectAvatar.bind(usersController))
);

usersRouter.post(
  '/me/avatar/upload',
  requireAuth,
  uploadAvatarMiddleware,
  asyncHandler(usersController.uploadAvatar.bind(usersController))
);

usersRouter.get(
  '/:id/public',
  requireAuth,
  asyncHandler(usersController.getPublicPlayer.bind(usersController))
);

usersRouter.use(usersController.notImplemented.bind(usersController));

module.exports = { usersRouter, avatarsRouter };
