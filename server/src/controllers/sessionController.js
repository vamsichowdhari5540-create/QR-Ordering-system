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

module.exports = { getSession, getSessionForTable };
