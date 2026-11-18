/**
 * middleware/jwtSession.js
 * Stateless JWT session middleware that emulates req.session for zero-downtime compatibility.
 */
const { verifyToken, setAuthCookie, clearAuthCookie, signToken } = require('../utils/jwt');

function jwtSessionMiddleware(req, res, next) {
  // Initialize compatibility session object
  req.session = {
    isAdmin: false,
    adminUser: null,
    isStudent: false,
    studentUser: null,
    studentUserId: null,
    isPremium: false,
    destroy: function(cb) {
      clearAuthCookie(res, 'sppuvault_admin_token');
      clearAuthCookie(res, 'sppuvault_student_token');
      req.session.isAdmin = false;
      req.session.adminUser = null;
      req.session.isStudent = false;
      req.session.studentUser = null;
      req.session.studentUserId = null;
      req.session.isPremium = false;
      if (typeof cb === 'function') cb(null);
    }
  };

  // 1. Verify Admin JWT
  const adminToken = req.cookies?.sppuvault_admin_token || 
                     req.headers['x-admin-token'] || 
                     (req.headers.authorization?.startsWith('Bearer admin_') ? req.headers.authorization.slice(13) : null);

  if (adminToken) {
    const decoded = verifyToken(adminToken);
    if (decoded && decoded.isAdmin) {
      req.session.isAdmin = true;
      req.session.adminUser = decoded.adminUser;
    }
  }

  // 2. Verify Student JWT
  const studentToken = req.cookies?.sppuvault_student_token || 
                       req.headers['x-student-token'] || 
                       (req.headers.authorization?.startsWith('Bearer ') && !req.headers.authorization.startsWith('Bearer admin_') ? req.headers.authorization.slice(7) : null);

  if (studentToken) {
    const decoded = verifyToken(studentToken);
    if (decoded && decoded.isStudent) {
      req.session.isStudent = true;
      req.session.studentUser = decoded.studentUser;
      req.session.studentUserId = decoded.studentUserId;
      req.session.isPremium = Boolean(decoded.isPremium);
    }
  }

  next();
}

module.exports = jwtSessionMiddleware;
