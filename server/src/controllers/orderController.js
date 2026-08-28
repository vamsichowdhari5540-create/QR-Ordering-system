const orderModel = require('../models/orderModel');
const { emitNewOrder } = require('../sockets');

async function createOrder(req, res) {
  const { tableId, customer, items } = req.body;

  try {
    const order = await orderModel.createOrder({ tableId, customer, items });
    emitNewOrder(order);
    res.status(201).json({ success: true, order });
  } catch (err) {
    if (err.name === 'OrderValidationError') {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    throw err;
  }
}

// Public — no login. The token (issued at creation, never derivable from the
// order id) is what proves this caller placed the order, since order ids are
// small and sequential enough to guess or enumerate outright.
async function getOrderStatus(req, res) {
  const order = await orderModel.getOrderByIdForCustomer(req.params.orderId, req.query.token);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
  res.json({ success: true, order });
}

module.exports = { createOrder, getOrderStatus };
