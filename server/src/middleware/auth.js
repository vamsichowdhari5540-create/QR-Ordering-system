const jwt = require('jsonwebtoken');

function adminAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Tokens issued before roles existed have no role claim — treat them as OWNER.
    req.admin = { id: payload.sub, email: payload.email, role: payload.role || 'OWNER' };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

// Gate for the things only the owner may do — revenue, settling bills, editing the menu.
function requireRole(...roles) {
  return function (req, res, next) {
    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({ success: false, error: 'Not allowed for your role' });
    }
    next();
  };
}

// Used by the /admin Socket.IO namespace handshake — same JWT, different transport.
function verifySocketToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { adminAuth, requireRole, verifySocketToken };
