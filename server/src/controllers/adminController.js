const orderModel = require('../models/orderModel');
const sessionModel = require('../models/sessionModel');
const menuModel = require('../models/menuModel');
const printJobModel = require('../models/printJobModel');
const ledgerModel = require('../models/ledgerModel');
const customerModel = require('../models/customerModel');
const pool = require('../config/db');
const { buildKotPayload } = require('../printing/kotGenerator');
const { buildReceiptPayload } = require('../printing/receiptGenerator');
const { buildFinalBillPayload } = require('../printing/finalBillGenerator');
const { buildDayStatement } = require('../printing/statementGenerator');
const {
  emitOrderStatusChange,
  emitSessionClosed,
  emitItemUnavailable,
  emitItemAvailable,
} = require('../sockets');

// Full menu for the admin "Today's Menu" screen — every category and item, unfiltered.
async function getFullMenu(req, res) {
  const categories = await menuModel.getFullMenuForAdmin();
  res.json({ success: true, categories });
}

async function getDashboard(req, res) {
  const isOwner = req.admin.role === 'OWNER';

  const [activeSessions, pendingOrders, daySummary] = await Promise.all([
    sessionModel.getActiveSessions(),
    orderModel.getPendingOrders(),
    // Money never leaves the server for a floor-server session.
    isOwner ? ledgerModel.getDaySummary() : Promise.resolve(null),
  ]);

  res.json({
    success: true,
    role: req.admin.role,
    totalTables: Number(process.env.TOTAL_TABLES) || 15,
    activeSessions,
    pendingOrders,
    ...(isOwner ? { dayRevenue: daySummary.totalRevenue, dayStats: daySummary } : {}),
  });
}

async function printKot(req, res) {
  const order = await orderModel.getOrderById(req.params.orderId);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

  const job = await printJobModel.enqueue(order.id, 'KOT', buildKotPayload(order));
  await orderModel.markKotPrinted(order.id);
  if (order.status === 'PENDING') {
    await pool.query(`UPDATE orders SET status = 'CONFIRMED' WHERE id = :id`, { id: order.id });
    emitOrderStatusChange(order.id, 'CONFIRMED');
  }
  res.json({ success: true, message: 'KOT queued for printing', job });
}

async function printReceipt(req, res) {
  const order = await orderModel.getOrderById(req.params.orderId);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

  const [customerRows] = await pool.query(
    'SELECT mobileEncrypted FROM customers WHERE id = :id',
    { id: order.customerId }
  );
  const mobile = customerRows[0]
    ? customerModel.decryptForDisplay(customerRows[0].mobileEncrypted)
    : 'N/A';

  const job = await printJobModel.enqueue(order.id, 'RECEIPT', buildReceiptPayload(order, mobile));
  await orderModel.markReceiptPrinted(order.id);
  res.json({ success: true, message: 'Receipt queued for printing', job });
}

async function createCategory(req, res) {
  const id = await menuModel.createCategory(req.body);
  res.status(201).json({ success: true, id });
}

async function updateCategory(req, res) {
  await menuModel.updateCategory(Number(req.params.categoryId), req.body);
  res.json({ success: true });
}

async function createItem(req, res) {
  const id = await menuModel.createItem(req.body);
  res.status(201).json({ success: true, id });
}

async function updateItem(req, res) {
  await menuModel.updateItem(Number(req.params.itemId), req.body);
  res.json({ success: true });
}

async function setItemAvailability(req, res) {
  const itemId = Number(req.params.itemId);
  const { available } = req.body;
  const item = await menuModel.setItemAvailability(itemId, Boolean(available));
  if (!item) return res.status(404).json({ success: false, error: 'Item not found' });

  if (item.available) emitItemAvailable({ itemId: item.id });
  else emitItemUnavailable({ itemId: item.id, name: item.name });

  res.json({ success: true, item });
}

// Shared by both whole-table settle and per-guest settle — bills whatever
// order set it's handed and queues the print job for it.
async function printFinalBill(session, fullOrders) {
  const lastOrder = fullOrders[fullOrders.length - 1];
  const [customerRows] = await pool.query(
    'SELECT mobileEncrypted FROM customers WHERE id = :id',
    { id: lastOrder.customerId }
  );
  const mobile = customerRows[0] ? customerModel.decryptForDisplay(customerRows[0].mobileEncrypted) : 'N/A';

  return printJobModel.enqueue(
    lastOrder.id,
    'FINAL_BILL',
    buildFinalBillPayload(session, fullOrders, mobile)
  );
}

// Settles one guest's orders at a shared table without closing it for whoever
// else is still sitting there. The table only actually clears once every
// guest currently at it has been settled this way.
async function settleGuest(req, res) {
  const { sessionId } = req.params;
  const customerId = Number(req.body.customerId);

  const session = await sessionModel.getSessionById(sessionId);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (session.status !== 'OPEN') {
    return res.status(400).json({ success: false, error: 'This table has already been cleared' });
  }

  // Identity is the customer record (keyed on mobile number), not the typed name —
  // two different guests can type the same name, and the same guest re-ordering
  // should land back on their own running bill regardless of how they spell it this time.
  const sessionOrders = await sessionModel.getOrdersForSession(sessionId);
  const guestOrders = sessionOrders.filter(
    (o) => o.customerId === customerId && o.status !== 'CANCELLED' && !o.paidAt
  );

  if (guestOrders.length === 0) {
    return res.status(400).json({ success: false, error: 'No unpaid orders found for that guest' });
  }

  // Oldest order's name is what the bill and error messages show — matches how
  // the ledger displays the group, so it doesn't shift if they re-typed their
  // name slightly differently on a later round.
  const displayName = guestOrders[0].customerName;

  const unserved = guestOrders.filter((o) => o.status === 'CONFIRMED' || o.status === 'READY');
  if (unserved.length > 0) {
    return res.status(400).json({
      success: false,
      error: `${unserved.length} order(s) for ${displayName} still need to be served before settling: ${unserved.map((o) => o.id).join(', ')}`,
    });
  }

  const fullOrders = await Promise.all(guestOrders.map((o) => orderModel.getOrderById(o.id)));
  const printJob = await printFinalBill(session, fullOrders);

  await pool.query(`UPDATE orders SET paidAt = NOW() WHERE id IN (:ids)`, {
    ids: guestOrders.map((o) => o.id),
  });

  // Anyone at the table besides this guest, still unpaid and not cancelled?
  const settledIds = new Set(guestOrders.map((o) => o.id));
  const stillOwing = sessionOrders.some(
    (o) => !settledIds.has(o.id) && o.status !== 'CANCELLED' && !o.paidAt
  );

  let tableClosed = false;
  if (!stillOwing) {
    const closed = await sessionModel.closeSession(sessionId, null);
    emitSessionClosed(closed);
    tableClosed = true;
  }

  res.json({
    success: true,
    printJob,
    tableClosed,
    settled: {
      customerId,
      customerName: displayName,
      orderIds: guestOrders.map((o) => o.id),
      grandTotal: fullOrders.reduce((sum, o) => sum + Number(o.grandTotal), 0),
    },
  });
}

async function closeSession(req, res) {
  const { sessionId } = req.params;
  const { notes } = req.body;

  const session = await sessionModel.getSessionById(sessionId);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

  const sessionOrders = await sessionModel.getOrdersForSession(sessionId);
  const unserved = sessionOrders.filter((o) => o.status === 'CONFIRMED' || o.status === 'READY');
  if (unserved.length > 0) {
    return res.status(400).json({
      success: false,
      error: `${unserved.length} order(s) still need to be served before this table can be settled: ${unserved.map((o) => o.id).join(', ')}`,
    });
  }

  // Cancelled orders were already unwound from the session total — keep them off the bill.
  const billableOrders = sessionOrders.filter((o) => o.status !== 'CANCELLED');
  const fullOrders = await Promise.all(billableOrders.map((o) => orderModel.getOrderById(o.id)));

  let printJob = null;
  if (fullOrders.length > 0) {
    printJob = await printFinalBill(session, fullOrders);
  }

  if (billableOrders.length > 0) {
    await pool.query(`UPDATE orders SET paidAt = NOW() WHERE id IN (:ids) AND paidAt IS NULL`, {
      ids: billableOrders.map((o) => o.id),
    });
  }

  const closed = await sessionModel.closeSession(sessionId, notes);
  emitSessionClosed(closed);

  res.json({
    success: true,
    printJob,
    finalBill: {
      sessionId,
      tableId: session.tableId,
      orders: billableOrders.map((o) => ({ orderId: o.id, grandTotal: o.grandTotal, createdAt: o.createdAt })),
      totalAmount: session.totalAmount,
      totalTax: session.totalTax,
    },
  });
}

// Staff has seen the "call server" alert and is heading to the table — clears
// the blinking indicator on both the owner and floor dashboards.
async function acknowledgeCall(req, res) {
  const session = await sessionModel.acknowledgeServerCall(req.params.sessionId);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  res.json({ success: true, session });
}

// Day book for the owner: the day's takings plus every table visit behind them.
async function getDayHistory(req, res) {
  const date = req.query.date || null;
  const [summary, orders] = await Promise.all([
    ledgerModel.getDaySummary(date),
    ledgerModel.getDayOrders(date),
  ]);

  // Group the flat order rows into the table visits they belonged to.
  const visits = new Map();
  for (const o of orders) {
    if (!visits.has(o.sessionId)) {
      visits.set(o.sessionId, {
        sessionId: o.sessionId,
        tableId: o.tableId,
        sessionStatus: o.sessionStatus,
        openedAt: o.openedAt,
        closedAt: o.closedAt,
        guest: o.customerName,
        total: 0,
        orders: [],
      });
    }
    const visit = visits.get(o.sessionId);
    visit.orders.push({
      id: o.id,
      status: o.status,
      customerName: o.customerName,
      subtotal: Number(o.subtotal),
      taxTotal: Number(o.taxTotal),
      grandTotal: Number(o.grandTotal),
      createdAt: o.createdAt,
    });
    if (o.status !== 'CANCELLED') visit.total += Number(o.grandTotal);
  }

  res.json({
    success: true,
    date: summary.date,
    summary,
    cancelledCount: orders.filter((o) => o.status === 'CANCELLED').length,
    visits: [...visits.values()],
  });
}

// Same day book, as a downloadable PDF statement.
async function exportDayStatement(req, res) {
  const date = req.query.date || null;
  const [summary, orders] = await Promise.all([
    ledgerModel.getDaySummary(date),
    ledgerModel.getDayOrders(date),
  ]);

  const doc = buildDayStatement({ date: summary.date, summary, orders });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="food-politics-statement-${summary.date}.pdf"`);
  doc.pipe(res);
  doc.end();
}

async function getDailySummary(req, res) {
  const date = req.query.date;
  const summary = await ledgerModel.getDaySummary(date);
  res.json({ success: true, ...summary });
}

async function completeOrder(req, res) {
  const order = await orderModel.completeOrder(req.params.orderId);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
  emitOrderStatusChange(order.id, 'COMPLETED');
  res.json({ success: true, order });
}

const CANCEL_ERRORS = {
  NOT_FOUND: [404, 'Order not found'],
  ALREADY_CANCELLED: [400, 'That order is already cancelled'],
  ALREADY_SERVED: [400, 'That order has already been served and cannot be cancelled'],
};

async function cancelOrder(req, res) {
  const result = await orderModel.cancelOrder(req.params.orderId);
  if (result.error) {
    const [status, message] = CANCEL_ERRORS[result.error];
    return res.status(status).json({ success: false, error: message });
  }
  emitOrderStatusChange(result.order.id, 'CANCELLED');
  res.json({ success: true, order: result.order });
}

// Consumed by the kitchen display screen (client /kitchen).
async function getKitchenQueue(req, res) {
  const orders = await orderModel.getKitchenQueue();
  res.json({ success: true, orders });
}

async function markOrderReady(req, res) {
  const order = await orderModel.markReady(req.params.orderId);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
  emitOrderStatusChange(order.id, 'READY');
  res.json({ success: true, order });
}

// Consumed by the local print-agent (server/print-agent), not the browser dashboard.
async function getPendingPrintJobs(req, res) {
  const jobs = await printJobModel.getPending();
  res.json({ success: true, jobs });
}

async function completePrintJob(req, res) {
  const { id } = req.params;
  const { status, errorMessage } = req.body;
  if (status === 'FAILED') {
    await printJobModel.markFailed(id, errorMessage);
  } else {
    await printJobModel.markPrinted(id);
  }
  res.json({ success: true });
}

module.exports = {
  getFullMenu,
  getDashboard,
  createCategory,
  updateCategory,
  createItem,
  updateItem,
  printKot,
  printReceipt,
  setItemAvailability,
  closeSession,
  settleGuest,
  acknowledgeCall,
  getDailySummary,
  getDayHistory,
  exportDayStatement,
  completeOrder,
  cancelOrder,
  getKitchenQueue,
  markOrderReady,
  getPendingPrintJobs,
  completePrintJob,
};
