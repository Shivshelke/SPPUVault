/**
 * models/Product.js — Native MongoDB driver collection wrapper
 */
const { createModel } = require('../utils/db');

const Product = createModel('products', {
  isPublished: false,
  isPinned: false,
  isFeatured: false,
  isBestSeller: false,
  createdAt: new Date()
});

module.exports = Product;
