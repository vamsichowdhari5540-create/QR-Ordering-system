const mysql = require('mysql2/promise');

// Managed MySQL hosts (Aiven, PlanetScale, etc.) require TLS — set DB_SSL=true
// and optionally DB_SSL_CA to the provider's CA certificate contents. Local
// XAMPP/MySQL needs neither, so this stays off by default.
const ssl = process.env.DB_SSL === 'true'
  ? { ca: process.env.DB_SSL_CA || undefined, rejectUnauthorized: process.env.DB_SSL_CA ? true : false }
  : undefined;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  decimalNumbers: true,
  ssl,
});

module.exports = pool;
