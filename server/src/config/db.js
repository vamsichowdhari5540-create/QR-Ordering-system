const mysql = require('mysql2/promise');

// Managed MySQL hosts (Aiven, PlanetScale, etc.) require TLS — set DB_SSL=true
// and optionally DB_SSL_CA to the provider's CA certificate contents. Local
// XAMPP/MySQL needs neither, so this stays off by default.
const ssl = process.env.DB_SSL === 'true'
  ? { ca: process.env.DB_SSL_CA?.trim() || undefined, rejectUnauthorized: process.env.DB_SSL_CA ? true : false }
  : undefined;

// Host dashboards' env var boxes are often multi-line textareas — an
// accidental Enter after pasting leaves a trailing newline that breaks DNS
// lookup with a confusing ENOTFOUND. None of these values are ever
// legitimately whitespace, so trimming is always safe.
const pool = mysql.createPool({
  host: process.env.DB_HOST?.trim(),
  port: process.env.DB_PORT?.trim() || 3306,
  user: process.env.DB_USER?.trim(),
  password: process.env.DB_PASSWORD?.trim(),
  database: process.env.DB_NAME?.trim(),
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  decimalNumbers: true,
  ssl,
});

module.exports = pool;
