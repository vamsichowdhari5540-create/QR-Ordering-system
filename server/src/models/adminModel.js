const pool = require('../config/db');

async function findByEmail(email) {
  const [rows] = await pool.query(
    'SELECT * FROM admins WHERE email = :email AND active = TRUE',
    { email }
  );
  return rows[0] || null;
}

async function createAdmin({ email, passwordHash, name, role }) {
  const [result] = await pool.query(
    'INSERT INTO admins (email, passwordHash, name, role) VALUES (:email, :passwordHash, :name, :role) RETURNING id',
    { email, passwordHash, name: name || null, role: role || 'OWNER' }
  );
  return result.insertId;
}

module.exports = { findByEmail, createAdmin };
