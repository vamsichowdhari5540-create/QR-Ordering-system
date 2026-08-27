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

async function getOrderStatus(req, res) {
  const order = await orderModel.getOrderById(req.params.orderId);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
  res.json({ success: true, order });
}

module.exports = { createOrder, getOrderStatus };
