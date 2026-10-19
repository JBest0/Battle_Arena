const express = require('express');
const { authController } = require('../../container');
const { asyncHandler } = require('../../shared/asyncHandler');
const { validate } = require('../../shared/middleware/validate');
const { registerSchema, verifyEmailSchema, resendVerificationSchema } = require('./auth.schemas');

const router = express.Router();

router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(authController.register.bind(authController))
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
