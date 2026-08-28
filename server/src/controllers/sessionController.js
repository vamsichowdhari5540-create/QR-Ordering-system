const sessionModel = require('../models/sessionModel');

async function getSession(req, res) {
  const session = await sessionModel.getSessionById(req.params.sessionId);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  const orders = await sessionModel.getOrdersForSession(session.id);
  res.json({ success: true, session, orders });
}

async function getSessionForTable(req, res) {
  const tableId = Number(req.params.tableId);
  const session = await sessionModel.getOrCreateSessionForTable(tableId);
  const orders = await sessionModel.getOrdersForSession(session.id);
  res.json({ success: true, session, orders });
}

// Public, customer-facing — no login on the guest's phone. A tap here is
// deliberately trusted the same way an order is: it just marks the table,
// nothing else.
async function callServer(req, res) {
  const tableId = Number(req.params.tableId);
  const session = await sessionModel.requestServerCall(tableId);
  res.json({ success: true, session });
}

module.exports = { getSession, getSessionForTable, callServer };
