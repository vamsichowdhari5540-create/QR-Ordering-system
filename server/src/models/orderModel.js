const pool = require('../config/db');
const { nextOrderId } = require('../utils/ids');
const { calculateGst, round2 } = require('../utils/gst');
const { getItemById, getVariantById } = require('./menuModel');
const { findOrCreateCustomer } = require('./customerModel');
const sessionModel = require('./sessionModel');

class OrderValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OrderValidationError';
    this.status = 400;
  }
}

// Recomputes every price from the DB — client-submitted prices/totals are never trusted.
async function priceCartItems(conn, cartItems) {
  const priced = [];
  let subtotal = 0;

  for (const line of cartItems) {
    const item = await getItemById(line.itemId, conn);
    if (!item) throw new OrderValidationError(`Item ${line.itemId} does not exist`);
    if (!item.available) throw new OrderValidationError(`${item.name} is no longer available`);

    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new OrderValidationError(`Invalid quantity for ${item.name}`);
    }

    let unitPrice = Number(item.basePrice);
    let variant = null;
    if (line.variantId) {
      variant = await getVariantById(line.variantId, conn);
      if (!variant || variant.itemId !== item.id) {
        throw new OrderValidationError(`Invalid variant for ${item.name}`);
      }
      unitPrice += Number(variant.priceModifier);
    }

    const itemTotal = round2(unitPrice * quantity);
    subtotal = round2(subtotal + itemTotal);

    priced.push({
      itemId: item.id,
      itemName: item.name,
      quantity,
      variantId: variant ? variant.id : null,
      variantName: variant ? variant.name : null,
      selectedModifiers: line.modifiers || [],
      specialNotes: (line.specialNotes || '').slice(0, 500),
      itemPrice: unitPrice,
      itemTotal,
    });
  }

  return { priced, subtotal };
}

async function createOrder({ tableId, customer, items }) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new OrderValidationError('Cart is empty');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const session = await sessionModel.getOrCreateSessionForTable(tableId);
    const { priced, subtotal } = await priceCartItems(conn, items);
    const { cgstAmount, sgstAmount, taxTotal, grandTotal } = calculateGst(subtotal);

    const customerId = await findOrCreateCustomer(conn, customer);
    const orderId = await nextOrderId(conn);

    // Every order is cash, collected by the cashier at the counter — confirmed immediately.
    await conn.query(
      `INSERT INTO orders
        (id, sessionId, tableId, customerId, customerName, status,
         subtotal, cgstAmount, sgstAmount, taxTotal, grandTotal)
       VALUES
        (:orderId, :sessionId, :tableId, :customerId, :customerName, 'CONFIRMED',
         :subtotal, :cgstAmount, :sgstAmount, :taxTotal, :grandTotal)`,
      {
        orderId,
        sessionId: session.id,
        tableId,
        customerId,
        customerName: customer.name,
        subtotal,
        cgstAmount,
        sgstAmount,
        taxTotal,
        grandTotal,
      }
    );

    for (const line of priced) {
      await conn.query(
        `INSERT INTO order_items
          (orderId, itemId, itemName, quantity, variantId, variantName, selectedModifiers,
           specialNotes, itemPrice, itemTotal)
         VALUES
          (:orderId, :itemId, :itemName, :quantity, :variantId, :variantName, :selectedModifiers,
           :specialNotes, :itemPrice, :itemTotal)`,
        { orderId, ...line, selectedModifiers: JSON.stringify(line.selectedModifiers) }
      );
    }

    await sessionModel.touchSession(session.id, conn);
    await sessionModel.addToSessionTotals(session.id, { amount: subtotal, tax: taxTotal }, conn);

    await conn.commit();
    return getOrderById(orderId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function getOrderById(orderId) {
  const [orders] = await pool.query('SELECT * FROM orders WHERE id = :orderId', { orderId });
  const order = orders[0];
  if (!order) return null;

  const [items] = await pool.query(
    'SELECT * FROM order_items WHERE orderId = :orderId ORDER BY id',
    { orderId }
  );
  return {
    ...order,
    items: items.map((item) => ({
      ...item,
      // Real MySQL's JSON columns come back already decoded; MariaDB (e.g.
      // local XAMPP) stores JSON as plain text and returns it as a string.
      // Only parse when the driver actually handed back a string.
      selectedModifiers:
        typeof item.selectedModifiers === 'string'
          ? JSON.parse(item.selectedModifiers)
          : item.selectedModifiers || [],
    })),
  };
}

async function markKotPrinted(orderId) {
  await pool.query('UPDATE orders SET kotPrintedAt = NOW() WHERE id = :orderId', { orderId });
}

async function markReceiptPrinted(orderId) {
  await pool.query('UPDATE orders SET receiptPrintedAt = NOW() WHERE id = :orderId', { orderId });
}

async function completeOrder(orderId) {
  await pool.query(
    `UPDATE orders SET status = 'COMPLETED', completedAt = NOW() WHERE id = :orderId`,
    { orderId }
  );
  return getOrderById(orderId);
}

// Guest changed their mind. Voids the order and unwinds its value from the running
// table bill, so the session total stays honest. Anything already served is off-limits.
async function cancelOrder(orderId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query('SELECT * FROM orders WHERE id = :orderId FOR UPDATE', {
      orderId,
    });
    const order = rows[0];

    if (!order) {
      await conn.rollback();
      return { error: 'NOT_FOUND' };
    }
    if (order.status === 'CANCELLED') {
      await conn.rollback();
      return { error: 'ALREADY_CANCELLED' };
    }
    if (order.status === 'COMPLETED') {
      await conn.rollback();
      return { error: 'ALREADY_SERVED' };
    }

    await conn.query(`UPDATE orders SET status = 'CANCELLED' WHERE id = :orderId`, { orderId });
    await sessionModel.addToSessionTotals(
      order.sessionId,
      { amount: -Number(order.subtotal), tax: -Number(order.taxTotal) },
      conn
    );
    await sessionModel.touchSession(order.sessionId, conn);

    // If that was the table's only order, there's nothing left to bill — free
    // the table now instead of leaving it stuck "awaiting bill" with no
    // orders and no way to settle it until the idle timeout eventually closes it.
    const [[{ activeCount }]] = await conn.query(
      `SELECT COUNT(*) AS activeCount FROM orders WHERE sessionId = :sessionId AND status != 'CANCELLED'`,
      { sessionId: order.sessionId }
    );
    if (activeCount === 0) {
      await conn.query(
        `UPDATE table_sessions SET status = 'CLOSED', closedAt = NOW() WHERE id = :sessionId`,
        { sessionId: order.sessionId }
      );
    }

    await conn.commit();
    return { order: await getOrderById(orderId) };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Kitchen has finished cooking — order is ready to be picked up/served.
async function markReady(orderId) {
  await pool.query(`UPDATE orders SET status = 'READY' WHERE id = :orderId`, { orderId });
  return getOrderById(orderId);
}

async function getPendingOrders() {
  const [rows] = await pool.query(
    `SELECT * FROM orders WHERE status IN ('CONFIRMED', 'READY') ORDER BY createdAt`
  );
  return rows;
}

// Everything the kitchen still needs to cook, oldest first, with full item detail.
async function getKitchenQueue() {
  const [rows] = await pool.query(
    `SELECT id FROM orders WHERE status = 'CONFIRMED' ORDER BY createdAt`
  );
  return Promise.all(rows.map((row) => getOrderById(row.id)));
}

module.exports = {
  OrderValidationError,
  createOrder,
  getOrderById,
  markKotPrinted,
  markReceiptPrinted,
  completeOrder,
  cancelOrder,
  markReady,
  getPendingOrders,
  getKitchenQueue,
};
