/**
 * models/CategoryConfig.js — Native MongoDB driver collection wrapper
 */
const { createModel } = require('../utils/db');

const CategoryConfig = createModel('categoryconfigs', {
  key: 'years_config'
});

module.exports = CategoryConfig;
