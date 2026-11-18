/**
 * models/Order.js — Native MongoDB driver collection wrapper
 */
const { createModel } = require('../utils/db');

const Order = createModel('orders', {
  paymentGateway: 'razorpay',
  status: 'pending',
  createdAt: new Date(),
  updatedAt: new Date()
});

module.exports = Order;
