/**
 * models/Student.js — Native MongoDB driver collection wrapper
 */
const { createModel } = require('../utils/db');

const Student = createModel('students', {
  isPremium: false,
  premiumStatus: 'none',
  requestSeen: false,
  registeredAt: new Date()
});

module.exports = Student;
