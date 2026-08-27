require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  const client = new Client({
    host: process.env.DB_HOST?.trim(),
    port: Number(process.env.DB_PORT?.trim()) || 5432,
    user: process.env.DB_USER?.trim(),
    password: process.env.DB_PASSWORD?.trim(),
    database: process.env.DB_NAME?.trim() || 'postgres',
    ssl: process.env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: false },
  });

  await client.connect();
  // Supabase already provisions the "postgres" database — nothing to create,
  // just apply the schema. pg's query() natively runs multi-statement SQL
  // (no mysql2-style multipleStatements flag needed).
  await client.query(schema);
  console.log('Schema applied to database:', client.database);

  await client.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
