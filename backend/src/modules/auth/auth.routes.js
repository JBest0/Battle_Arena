const express = require('express');
const { authController } = require('../../container');
const { asyncHandler } = require('../../shared/asyncHandler');
const { validate } = require('../../shared/middleware/validate');
const { requireAuth } = require('../../shared/middleware/requireAuth');
const {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
} = require('./auth.schemas');

const router = express.Router();

router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(authController.register.bind(authController))
);

router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(authController.login.bind(authController))
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(authController.me.bind(authController))
);

router.post(
  '/logout',
  requireAuth,
  asyncHandler(authController.logout.bind(authController))
);

router.post(
  '/verify-email',
  validate(verifyEmailSchema),
  asyncHandler(authController.verifyEmail.bind(authController))
);

router.post(
  '/resend-verification',
  validate(resendVerificationSchema),
  asyncHandler(authController.resendVerification.bind(authController))
);

router.use(authController.notImplemented.bind(authController));

module.exports = { authRouter: router };
