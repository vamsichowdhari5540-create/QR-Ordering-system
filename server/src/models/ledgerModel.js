const pool = require('../config/db');
const { TODAY, localDate } = require('../utils/businessDay');

// "Today" is the restaurant's local calendar day, resolved in SQL rather than
// from the Node process's clock — the app server's OS timezone (IST locally,
// UTC on the host) can disagree with the database's, and either one
// disagreeing with the restaurant's silently drops the night's orders.
// See utils/businessDay.js for why this is explicit rather than a session
// timezone setting.
const ORDER_DATE = localDate('createdAt');

async function getDaySummary(date) {
  const dateExpr = date ? ':date::date' : TODAY;
  const params = date ? { date } : {};

  const [totals] = await pool.query(
    `SELECT
      TO_CHAR(${dateExpr}, 'YYYY-MM-DD') AS date,
      COUNT(*) AS totalOrders,
      COALESCE(SUM(grandTotal), 0) AS totalRevenue,
      COALESCE(SUM(taxTotal), 0) AS totalTax
     FROM orders
     WHERE ${ORDER_DATE} = ${dateExpr} AND status IN ('CONFIRMED', 'READY', 'COMPLETED')`,
    params
  );

  const [byCategory] = await pool.query(
    `SELECT c.name AS category, SUM(oi.quantity) AS quantity, SUM(oi.itemTotal) AS revenue
     FROM order_items oi
     JOIN orders o ON o.id = oi.orderId
     JOIN items i ON i.id = oi.itemId
     JOIN categories c ON c.id = i.categoryId
     WHERE ${localDate('o.createdAt')} = ${dateExpr}
       AND o.status IN ('CONFIRMED', 'READY', 'COMPLETED')
     GROUP BY c.name
     ORDER BY revenue DESC`,
    params
  );

  return {
    ...totals[0],
    breakdown: { byCategory },
  };
}

// Every order taken on a given day, newest first, with the table visit it belonged to.
// Cancelled orders are included on purpose — the owner wants to see what was voided.
async function getDayOrders(date) {
  const dateExpr = date ? ':date::date' : TODAY;
  const params = date ? { date } : {};

  const [rows] = await pool.query(
    `SELECT o.id, o.sessionId, o.tableId, o.customerName, o.status,
            o.subtotal, o.taxTotal, o.grandTotal, o.createdAt, o.completedAt,
            s.status AS sessionStatus, s.openedAt, s.closedAt
     FROM orders o
     JOIN table_sessions s ON s.id = o.sessionId
     WHERE ${localDate('o.createdAt')} = ${dateExpr}
     ORDER BY o.createdAt DESC`,
    params
  );
  return rows;
}

async function upsertDailyLedger(date) {
  const summary = await getDaySummary(date);
  await pool.query(
    `INSERT INTO daily_ledger (date, totalOrders, totalRevenue, totalTax, closedAt)
     VALUES (:date::date, :totalOrders, :totalRevenue, :totalTax, NOW())
     ON CONFLICT (date) DO UPDATE SET
       totalOrders = EXCLUDED.totalOrders, totalRevenue = EXCLUDED.totalRevenue,
       totalTax = EXCLUDED.totalTax, closedAt = EXCLUDED.closedAt`,
    summary
  );
  return summary;
}

module.exports = { getDaySummary, getDayOrders, upsertDailyLedger };
