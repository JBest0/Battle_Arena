const express = require('express');
const { usersController } = require('../../container');
const { asyncHandler } = require('../../shared/asyncHandler');
const { validate } = require('../../shared/middleware/validate');
const { requireAuth } = require('../../shared/middleware/requireAuth');
const {
  uploadAvatarMiddleware,
} = require('../../infrastructure/FileStorage');
const { avatarSelectionSchema, updateProfileSchema, paginationSchema, userIdParamSchema } = require('./users.schemas');

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
  '/me/profile',
  requireAuth,
  asyncHandler(usersController.getMyProfile.bind(usersController))
);

usersRouter.patch(
  '/me',
  requireAuth,
  validate(updateProfileSchema),
  asyncHandler(usersController.updateMe.bind(usersController))
);

usersRouter.get(
  '/:id/profile',
  requireAuth,
  validate(userIdParamSchema, 'params'),
  asyncHandler(usersController.getProfile.bind(usersController))
);

usersRouter.get(
  '/:id/matches',
  requireAuth,
  validate(userIdParamSchema, 'params'),
  validate(paginationSchema, 'query'),
  asyncHandler(usersController.getMatchHistory.bind(usersController))
);

usersRouter.get(
  '/:id/public',
  requireAuth,
  asyncHandler(usersController.getPublicPlayer.bind(usersController))
);

usersRouter.use(usersController.notImplemented.bind(usersController));

module.exports = { usersRouter, avatarsRouter };
