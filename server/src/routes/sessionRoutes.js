const express = require('express');
const { param } = require('express-validator');
const sessionController = require('../controllers/sessionController');
const { validate } = require('../middleware/validate');

const router = express.Router();

router.get(
  '/table/:tableId',
  [param('tableId').isInt({ min: 1, max: 50 }).toInt()],
  validate,
  sessionController.getSessionForTable
);

router.get(
  '/:sessionId',
  [param('sessionId').isString().trim().notEmpty()],
  validate,
  sessionController.getSession
);

module.exports = router;
