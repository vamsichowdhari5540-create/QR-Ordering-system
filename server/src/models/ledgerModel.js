const pool = require('../config/db');

// "Today" must be resolved by the database's own clock, not the Node
// process's — the app server's OS timezone (IST locally, UTC on Render)
// can disagree with the DB's, and comparing DATE(createdAt) against a
// JS-computed date silently drops today's orders near midnight. Using
// CURDATE() directly in SQL sidesteps that instead of reconstructing a
// date string from a returned Date object (which has its own local/UTC
// pitfalls when read back in JS).
async function getDaySummary(date) {
  const dateExpr = date ? ':date' : 'CURDATE()';
  const params = date ? { date } : {};

  const [totals] = await pool.query(
    `SELECT
      DATE_FORMAT(${dateExpr}, '%Y-%m-%d') AS date,
      COUNT(*) AS totalOrders,
      COALESCE(SUM(grandTotal), 0) AS totalRevenue,
      COALESCE(SUM(taxTotal), 0) AS totalTax
     FROM orders
     WHERE DATE(createdAt) = ${dateExpr} AND status IN ('CONFIRMED', 'READY', 'COMPLETED')`,
    params
  );

  const [byCategory] = await pool.query(
    `SELECT c.name AS category, SUM(oi.quantity) AS quantity, SUM(oi.itemTotal) AS revenue
     FROM order_items oi
     JOIN orders o ON o.id = oi.orderId
     JOIN items i ON i.id = oi.itemId
     JOIN categories c ON c.id = i.categoryId
     WHERE DATE(o.createdAt) = ${dateExpr} AND o.status IN ('CONFIRMED', 'READY', 'COMPLETED')
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
  const dateExpr = date ? ':date' : 'CURDATE()';
  const params = date ? { date } : {};

  const [rows] = await pool.query(
    `SELECT o.id, o.sessionId, o.tableId, o.customerName, o.status,
            o.subtotal, o.taxTotal, o.grandTotal, o.createdAt, o.completedAt,
            s.status AS sessionStatus, s.openedAt, s.closedAt
     FROM orders o
     JOIN table_sessions s ON s.id = o.sessionId
     WHERE DATE(o.createdAt) = ${dateExpr}
     ORDER BY o.createdAt DESC`,
    params
  );
  return rows;
}

async function upsertDailyLedger(date) {
  const summary = await getDaySummary(date);
  await pool.query(
    `INSERT INTO daily_ledger (date, totalOrders, totalRevenue, totalTax, closedAt)
     VALUES (:date, :totalOrders, :totalRevenue, :totalTax, NOW())
     ON DUPLICATE KEY UPDATE
       totalOrders = VALUES(totalOrders), totalRevenue = VALUES(totalRevenue),
       totalTax = VALUES(totalTax), closedAt = NOW()`,
    summary
  );
  return summary;
}

module.exports = { getDaySummary, getDayOrders, upsertDailyLedger };
