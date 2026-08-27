require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  const ssl = process.env.DB_SSL === 'true'
    ? { ca: process.env.DB_SSL_CA || undefined, rejectUnauthorized: process.env.DB_SSL_CA ? true : false }
    : undefined;

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
    ssl,
  });

  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\` CHARACTER SET utf8mb4`
  );
  await connection.changeUser({ database: process.env.DB_NAME });

  await connection.query(schema);
  console.log('Schema applied to database:', process.env.DB_NAME);

  await connection.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
