// Pure-JS bcrypt — no native compilation step, and avoids bcrypt's own
// node-pre-gyp -> tar dependency chain (a critical path-traversal CVE with no
// available fix at the pinned version).
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const adminModel = require('../models/adminModel');

async function login(req, res) {
  const { email, password } = req.body;

  const admin = await adminModel.findByEmail(email);
  // Constant-shape response whether the email exists or not, to avoid user enumeration.
  const passwordHash = admin ? admin.passwordHash : '$2b$12$invalidsaltinvalidsaltinvalidsaltinva';
  const valid = await bcrypt.compare(password || '', passwordHash);

  if (!admin || !valid) {
    return res.status(401).json({ success: false, error: 'Invalid email or password' });
  }

  const token = jwt.sign(
    { sub: admin.id, email: admin.email, role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
  );

  res.json({
    success: true,
    token,
    admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
  });
}

module.exports = { login };
