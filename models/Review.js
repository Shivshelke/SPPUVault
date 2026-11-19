/**
 * models/Review.js — Native MongoDB driver collection wrapper for Student Reviews
 */
const { createModel } = require('../utils/db');

const Review = createModel('reviews', {
  name: 'Anonymous Student',
  rating: 5,
  year: 'FE',
  branch: 'Engineering',
  college: '',
  comment: '',
  avatarColor: '#6366f1',
  status: 'pending', // 'pending' or 'approved'
  createdAt: new Date()
});

module.exports = Review;
