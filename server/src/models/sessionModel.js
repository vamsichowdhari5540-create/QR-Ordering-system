const pool = require('../config/db');
const { newSessionId } = require('../utils/ids');

const IDLE_TIMEOUT_MINUTES = 90;

async function getOpenSessionForTable(tableId) {
  const [rows] = await pool.query(
    `SELECT *, EXTRACT(EPOCH FROM (NOW() - lastActivityAt)) / 60 AS idleMinutes
     FROM table_sessions WHERE tableId = :tableId AND status = 'OPEN'
     ORDER BY openedAt DESC LIMIT 1`,
    { tableId }
  );
  const session = rows[0];
  if (!session) return null;

  // Measured by the database against its own clock — comparing a DB
  // timestamp to the app server's Date.now() silently breaks whenever the
  // two machines' timezones disagree.
  const { idleMinutes } = session;
  if (idleMinutes > IDLE_TIMEOUT_MINUTES) {
    await pool.query(
      `UPDATE table_sessions SET status = 'CLOSED', closedAt = NOW() WHERE id = :id`,
      { id: session.id }
    );
    return null;
  }
  return session;
}

async function getOrCreateSessionForTable(tableId) {
  const existing = await getOpenSessionForTable(tableId);
  if (existing) return existing;

  const id = newSessionId(tableId);
  await pool.query(
    `INSERT INTO table_sessions (id, tableId, status) VALUES (:id, :tableId, 'OPEN')`,
    { id, tableId }
  );
  const [rows] = await pool.query('SELECT * FROM table_sessions WHERE id = :id', { id });
  return rows[0];
}

async function getSessionById(sessionId, conn = pool) {
  const [rows] = await conn.query('SELECT * FROM table_sessions WHERE id = :sessionId', {
    sessionId,
  });
  return rows[0] || null;
}

async function touchSession(sessionId, conn = pool) {
  await conn.query('UPDATE table_sessions SET lastActivityAt = NOW() WHERE id = :sessionId', {
    sessionId,
  });
}

async function addToSessionTotals(sessionId, { amount, tax }, conn = pool) {
  await conn.query(
    `UPDATE table_sessions
     SET totalAmount = totalAmount + :amount, totalTax = totalTax + :tax
     WHERE id = :sessionId`,
    { sessionId, amount, tax }
  );
}

async function getOrdersForSession(sessionId, conn = pool) {
  const [rows] = await conn.query(
    'SELECT * FROM orders WHERE sessionId = :sessionId ORDER BY createdAt',
    { sessionId }
  );
  return rows;
}

// Locks the session row so settle/close can't race with itself — two
// near-simultaneous taps (two staff members, or a double-tap) on the same
// table would otherwise both pass the "anything still unpaid?" check before
// either write lands, generating a duplicate final-bill print job.
async function lockSessionForUpdate(sessionId, conn) {
  const [rows] = await conn.query('SELECT * FROM table_sessions WHERE id = :sessionId FOR UPDATE', {
    sessionId,
  });
  return rows[0] || null;
}

async function closeSession(sessionId, notes, conn = pool) {
  await conn.query(
    `UPDATE table_sessions SET status = 'CLOSED', closedAt = NOW(), notes = :notes WHERE id = :sessionId`,
    { sessionId, notes: notes || null }
  );
  return getSessionById(sessionId, conn);
}

async function getActiveSessions() {
  const [rows] = await pool.query(
    `SELECT * FROM table_sessions WHERE status = 'OPEN' ORDER BY openedAt`
  );
  return rows;
}

// A guest tapping "Call server" implies an occupied table — reuses the same
// lazy session-creation the first order would, so calling before ordering
// still shows the table as occupied on the floor.
async function requestServerCall(tableId) {
  const session = await getOrCreateSessionForTable(tableId);
  await pool.query('UPDATE table_sessions SET callRequestedAt = NOW() WHERE id = :id', {
    id: session.id,
  });
  return getSessionById(session.id);
}

async function acknowledgeServerCall(sessionId) {
  await pool.query('UPDATE table_sessions SET callRequestedAt = NULL WHERE id = :sessionId', {
    sessionId,
  });
  return getSessionById(sessionId);
}

module.exports = {
  getOpenSessionForTable,
  getOrCreateSessionForTable,
  getSessionById,
  touchSession,
  addToSessionTotals,
  getOrdersForSession,
  closeSession,
  getActiveSessions,
  requestServerCall,
  acknowledgeServerCall,
  lockSessionForUpdate,
};
