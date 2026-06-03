const jwt = require('jsonwebtoken');
require('dotenv').config();

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'default_access_secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'default_refresh_secret';

// Middleware to authenticate JWT access tokens
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required', code: 'UNAUTHORIZED' });
  }

  jwt.verify(token, ACCESS_SECRET, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Access token expired', code: 'TOKEN_EXPIRED' });
      }
      return res.status(403).json({ error: 'Invalid access token', code: 'FORBIDDEN' });
    }
    req.user = user;
    next();
  });
}

// Middleware to check if user is an organizer
function requireOrganizer(req, res, next) {
  if (!req.user || req.user.role !== 'organizer') {
    return res.status(403).json({ error: 'Organizer permission required', code: 'FORBIDDEN' });
  }
  next();
}

// Middleware to check if user has staff/organizer privileges for ticket validation
function requireStaffOrOrganizer(req, res, next) {
  if (!req.user || (req.user.role !== 'staff' && req.user.role !== 'organizer')) {
    return res.status(403).json({ error: 'Staff or Organizer permission required', code: 'FORBIDDEN' });
  }
  next();
}

// Token generation helpers
function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    ACCESS_SECRET,
    { expiresIn: '15m' }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    REFRESH_SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = {
  authenticateToken,
  requireOrganizer,
  requireStaffOrOrganizer,
  generateAccessToken,
  generateRefreshToken,
  ACCESS_SECRET,
  REFRESH_SECRET,
};
