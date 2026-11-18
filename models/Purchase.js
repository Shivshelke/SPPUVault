/**
 * models/Purchase.js — Native MongoDB driver collection wrapper
 */
const { createModel } = require('../utils/db');

const Purchase = createModel('purchases', {
  purchasedAt: new Date()
});

module.exports = Purchase;
