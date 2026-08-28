const express = require('express');
const { body, param, query } = require('express-validator');
const adminController = require('../controllers/adminController');
const { adminAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();
router.use(adminAuth);

// Owner-only from here down; the floor-server routes are marked individually below.
const ownerOnly = requireRole('OWNER');

router.get('/dashboard', adminController.getDashboard);
router.get('/menu', ownerOnly, adminController.getFullMenu);

// Order detail for the ledger panels — OWNER and SERVER both work the floor.
router.get(
  '/orders/:orderId',
  [param('orderId').isString().trim().notEmpty()],
  validate,
  adminController.getOrderDetail
);

router.post(
  '/categories',
  ownerOnly,
  [body('name').trim().isLength({ min: 1, max: 100 }), body('displayOrder').optional().isInt().toInt()],
  validate,
  adminController.createCategory
);

router.put(
  '/categories/:categoryId',
  ownerOnly,
  [
    param('categoryId').isInt({ min: 1 }).toInt(),
    body('name').optional().trim().isLength({ min: 1, max: 100 }),
    body('displayOrder').optional().isInt().toInt(),
    body('active').optional().isBoolean(),
  ],
  validate,
  adminController.updateCategory
);

router.post(
  '/items',
  ownerOnly,
  [
    body('categoryId').isInt({ min: 1 }).toInt(),
    body('name').trim().isLength({ min: 1, max: 150 }),
    body('description').optional().isString().isLength({ max: 2000 }),
    body('basePrice').isFloat({ min: 0 }).toFloat(),
    body('displayOrder').optional().isInt().toInt(),
    body('variants').optional().isArray(),
    body('modifiers').optional().isArray(),
  ],
  validate,
  adminController.createItem
);

router.put(
  '/items/:itemId',
  ownerOnly,
  [
    param('itemId').isInt({ min: 1 }).toInt(),
    body('name').optional().trim().isLength({ min: 1, max: 150 }),
    body('description').optional().isString().isLength({ max: 2000 }),
    body('basePrice').optional().isFloat({ min: 0 }).toFloat(),
    body('displayOrder').optional().isInt().toInt(),
    body('active').optional().isBoolean(),
  ],
  validate,
  adminController.updateItem
);

router.post(
  '/print/kot/:orderId',
  ownerOnly,
  [param('orderId').isString().trim().notEmpty()],
  validate,
  adminController.printKot
);

router.post(
  '/print/receipt/:orderId',
  ownerOnly,
  [param('orderId').isString().trim().notEmpty()],
  validate,
  adminController.printReceipt
);

router.put(
  '/items/:itemId/availability',
  ownerOnly,
  [param('itemId').isInt({ min: 1 }).toInt(), body('available').isBoolean()],
  validate,
  adminController.setItemAvailability
);

router.post(
  '/sessions/:sessionId/close',
  requireRole('OWNER', 'SERVER'),
  [param('sessionId').isString().trim().notEmpty(), body('notes').optional().isString().isLength({ max: 1000 })],
  validate,
  adminController.closeSession
);

// Bills one guest at a shared table without closing it for whoever else is still seated there.
router.post(
  '/sessions/:sessionId/settle-guest',
  requireRole('OWNER', 'SERVER'),
  [param('sessionId').isString().trim().notEmpty(), body('customerId').isInt({ min: 1 }).toInt()],
  validate,
  adminController.settleGuest
);

// Clears the blinking "call server" indicator once staff has seen it.
router.post(
  '/sessions/:sessionId/acknowledge-call',
  requireRole('OWNER', 'SERVER'),
  [param('sessionId').isString().trim().notEmpty()],
  validate,
  adminController.acknowledgeCall
);

router.get(
  '/history',
  ownerOnly,
  [query('date').optional().isISO8601()],
  validate,
  adminController.getDayHistory
);

router.get(
  '/history/export',
  ownerOnly,
  [query('date').optional().isISO8601()],
  validate,
  adminController.exportDayStatement
);

router.get(
  '/daily-summary',
  ownerOnly,
  [query('date').optional().isISO8601()],
  validate,
  adminController.getDailySummary
);

// Marking an order served is the floor server's job (owner can still do it).
router.post(
  '/orders/:orderId/complete',
  requireRole('OWNER', 'SERVER'),
  [param('orderId').isString().trim().notEmpty()],
  validate,
  adminController.completeOrder
);

// Guest changed their mind before the food reached them.
router.post(
  '/orders/:orderId/cancel',
  requireRole('OWNER', 'SERVER'),
  [param('orderId').isString().trim().notEmpty()],
  validate,
  adminController.cancelOrder
);

// Consumed by the kitchen display screen (client /kitchen)
router.get('/kitchen/orders', adminController.getKitchenQueue);
router.post(
  '/kitchen/orders/:orderId/ready',
  [param('orderId').isString().trim().notEmpty()],
  validate,
  adminController.markOrderReady
);

// Consumed by /print-agent
router.get('/print-jobs/pending', ownerOnly, adminController.getPendingPrintJobs);
router.post(
  '/print-jobs/:id/complete',
  ownerOnly,
  [param('id').isInt({ min: 1 }).toInt(), body('status').optional().isIn(['PRINTED', 'FAILED'])],
  validate,
  adminController.completePrintJob
);

module.exports = router;
