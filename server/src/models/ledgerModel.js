const pool = require('../config/db');

function dateStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

async function getDaySummary(date = dateStr()) {
  const [totals] = await pool.query(
    `SELECT
      COUNT(*) AS totalOrders,
      COALESCE(SUM(grandTotal), 0) AS totalRevenue,
      COALESCE(SUM(taxTotal), 0) AS totalTax
     FROM orders
     WHERE DATE(createdAt) = :date AND status IN ('CONFIRMED', 'READY', 'COMPLETED')`,
    { date }
  );

  const [byCategory] = await pool.query(
    `SELECT c.name AS category, SUM(oi.quantity) AS quantity, SUM(oi.itemTotal) AS revenue
     FROM order_items oi
     JOIN orders o ON o.id = oi.orderId
     JOIN items i ON i.id = oi.itemId
     JOIN categories c ON c.id = i.categoryId
     WHERE DATE(o.createdAt) = :date AND o.status IN ('CONFIRMED', 'READY', 'COMPLETED')
     GROUP BY c.name
     ORDER BY revenue DESC`,
    { date }
  );

  return {
    date,
    ...totals[0],
    breakdown: { byCategory },
  };
}

// Every order taken on a given day, newest first, with the table visit it belonged to.
// Cancelled orders are included on purpose — the owner wants to see what was voided.
async function getDayOrders(date = dateStr()) {
  const [rows] = await pool.query(
    `SELECT o.id, o.sessionId, o.tableId, o.customerName, o.status,
            o.subtotal, o.taxTotal, o.grandTotal, o.createdAt, o.completedAt,
            s.status AS sessionStatus, s.openedAt, s.closedAt
     FROM orders o
     JOIN table_sessions s ON s.id = o.sessionId
     WHERE DATE(o.createdAt) = :date
     ORDER BY o.createdAt DESC`,
    { date }
  );
  return rows;
}

async function upsertDailyLedger(date = dateStr()) {
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

module.exports = { getDaySummary, getDayOrders, upsertDailyLedger, dateStr };
