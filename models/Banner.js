/**
 * models/Banner.js — Native MongoDB driver collection wrapper
 */
const { createModel } = require('../utils/db');

const Banner = createModel('banners', {
  key: 'main_banner',
  text: '',
  link: '',
  isActive: false
});

module.exports = Banner;
