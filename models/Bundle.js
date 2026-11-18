/**
 * models/Bundle.js — Native MongoDB driver collection wrapper
 */
const { createModel } = require('../utils/db');

const Bundle = createModel('bundles', {
  products: [],
  isPublished: false,
  isFeatured: false,
  createdAt: new Date()
});

module.exports = Bundle;
