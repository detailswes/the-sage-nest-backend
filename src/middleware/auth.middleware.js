const jwt = require('jsonwebtoken');
const prisma = require('../prisma/client');

function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Blocks unverified users from protected actions (e.g. creating a booking)
async function requireEmailVerified(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { is_verified: true },
    });
    if (!user || !user.is_verified) {
      return res.status(403).json({
        error: 'Please verify your email address before continuing.',
        email_not_verified: true,
      });
    }
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { authenticate, requireAdmin, requireEmailVerified };
