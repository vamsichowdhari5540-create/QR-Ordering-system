const { Server } = require('socket.io');
const { verifySocketToken } = require('../middleware/auth');

let ioInstance = null;
let adminNamespace = null;
let customerNamespace = null;

function initSockets(httpServer) {
  ioInstance = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL,
      credentials: true,
    },
  });

  // /admin — JWT-verified in the handshake, privileged actions only.
  adminNamespace = ioInstance.of('/admin');
  adminNamespace.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error('Unauthorized'));
    try {
      socket.admin = verifySocketToken(token);
      next();
    } catch (err) {
      next(new Error('Unauthorized'));
    }
  });
  adminNamespace.on('connection', (socket) => {
    socket.on('disconnect', () => {});
  });

  // /customer — read-only, no auth required, no privileged events accepted.
  customerNamespace = ioInstance.of('/customer');
  customerNamespace.on('connection', (socket) => {
    const tableId = socket.handshake.query && socket.handshake.query.table;
    if (tableId) socket.join(`table:${tableId}`);
    socket.on('disconnect', () => {});
  });

  return ioInstance;
}

function emitNewOrder(order) {
  if (adminNamespace) adminNamespace.emit('order:new', order);
}

function emitOrderStatusChange(orderId, newStatus) {
  if (adminNamespace) {
    adminNamespace.emit('order:status-change', { orderId, newStatus, timestamp: new Date() });
  }
}

function emitSessionClosed(session) {
  if (adminNamespace) adminNamespace.emit('session:closed', session);
}

// Broadcast to every customer tab — matches the spec's "removes from all phones instantly".
function emitItemUnavailable(item) {
  if (customerNamespace) customerNamespace.emit('item:unavailable', item);
}

function emitItemAvailable(item) {
  if (customerNamespace) customerNamespace.emit('item:available', item);
}

module.exports = {
  initSockets,
  emitNewOrder,
  emitOrderStatusChange,
  emitSessionClosed,
  emitItemUnavailable,
  emitItemAvailable,
};
