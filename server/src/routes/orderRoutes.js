const express = require('express');
const { body, param, query } = require('express-validator');
const orderController = require('../controllers/orderController');
const { validate } = require('../middleware/validate');
const { orderCreateLimiter, orderLookupLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.post(
  '/',
  orderCreateLimiter,
  [
    body('tableId').isInt({ min: 1, max: 50 }).toInt(),
    body('customer.name').trim().isLength({ min: 1, max: 100 }),
    body('customer.mobile').matches(/^\+?[1-9]\d{7,14}$/),
    body('items').isArray({ min: 1, max: 50 }),
    body('items.*.itemId').isInt({ min: 1 }).toInt(),
    body('items.*.quantity').isInt({ min: 1, max: 20 }).toInt(),
    body('items.*.variantId').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('items.*.modifiers').optional().isArray(),
    body('items.*.specialNotes').optional().isString().isLength({ max: 500 }),
  ],
  validate,
  orderController.createOrder
);

router.get(
  '/:orderId',
  orderLookupLimiter,
  [
    param('orderId').isString().trim().notEmpty(),
    query('token').isString().trim().isLength({ min: 32, max: 64 }),
  ],
  validate,
  orderController.getOrderStatus
);

module.exports = router;
