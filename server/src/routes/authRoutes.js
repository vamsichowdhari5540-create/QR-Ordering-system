const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { validate } = require('../middleware/validate');
const { loginLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.post(
  '/login',
  loginLimiter,
  [body('email').isEmail().normalizeEmail(), body('password').isString().isLength({ min: 1 })],
  validate,
  authController.login
);

module.exports = router;
