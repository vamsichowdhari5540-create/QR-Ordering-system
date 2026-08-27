require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  const ssl = process.env.DB_SSL === 'true'
    ? { ca: process.env.DB_SSL_CA?.trim() || undefined, rejectUnauthorized: process.env.DB_SSL_CA ? true : false }
    : undefined;

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST?.trim(),
    port: process.env.DB_PORT?.trim() || 3306,
    user: process.env.DB_USER?.trim(),
    password: process.env.DB_PASSWORD?.trim(),
    multipleStatements: true,
    ssl,
  });

  const dbName = process.env.DB_NAME?.trim();
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4`);
  await connection.changeUser({ database: dbName });

  await connection.query(schema);
  console.log('Schema applied to database:', dbName);

  await connection.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
