const express = require('express');
const { usersController } = require('../../container');

const usersRouter = express.Router();
const avatarsRouter = express.Router();

usersRouter.use(usersController.notImplemented.bind(usersController));

avatarsRouter.get(
  '/defaults',
  usersController.notImplemented.bind(usersController)
);

module.exports = { usersRouter, avatarsRouter };
