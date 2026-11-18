/**
 * models/Feedback.js — Native MongoDB driver collection wrapper
 */
const { createModel } = require('../utils/db');

const Feedback = createModel('feedbacks', {
  name: 'Anonymous',
  date: new Date(),
  isRead: false
});

module.exports = Feedback;
