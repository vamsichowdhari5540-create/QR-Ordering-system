const pool = require('../config/db');

async function enqueue(orderId, type, payload) {
  const [result] = await pool.query(
    `INSERT INTO print_jobs (orderId, type, status, payload) VALUES (:orderId, :type, 'PENDING', :payload) RETURNING id`,
    { orderId, type, payload: JSON.stringify(payload) }
  );
  const [rows] = await pool.query('SELECT * FROM print_jobs WHERE id = :id', {
    id: result.insertId,
  });
  return rows[0];
}

async function getPending() {
  const [rows] = await pool.query(
    `SELECT * FROM print_jobs WHERE status = 'PENDING' ORDER BY createdAt`
  );
  return rows;
}

async function markPrinted(id) {
  await pool.query(
    `UPDATE print_jobs SET status = 'PRINTED', printedAt = NOW() WHERE id = :id`,
    { id }
  );
}

async function markFailed(id, errorMessage) {
  await pool.query(
    `UPDATE print_jobs SET status = 'FAILED', errorMessage = :errorMessage WHERE id = :id`,
    { id, errorMessage: errorMessage || null }
  );
}

module.exports = { enqueue, getPending, markPrinted, markFailed };
