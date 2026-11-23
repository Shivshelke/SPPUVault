/**
 * models/Coupon.js — Native MongoDB driver collection wrapper for Coupons
 */
const { createModel } = require('../utils/db');

const Coupon = createModel('coupons', {
  code: '',
  discountType: 'percentage', // 'percentage' or 'flat'
  discountValue: 0,
  minOrderValue: 0,
  maxDiscount: null,
  maxUses: null,
  usedCount: 0,
  isActive: true,
  expiresAt: null,
  createdAt: new Date()
});

module.exports = Coupon;
