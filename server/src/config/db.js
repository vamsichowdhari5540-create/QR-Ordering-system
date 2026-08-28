const { Pool, types } = require('pg');

// mysql2 (decimalNumbers: true) returned NUMERIC and COUNT(*) as JS numbers;
// pg returns both as strings by default to avoid silent precision loss. Every
// call site already expects numbers (money math, `activeCount === 0` checks),
// so parse them the same way at the driver level instead of chasing every
// call site.
types.setTypeParser(20, (val) => parseInt(val, 10)); // BIGINT (COUNT(*) etc.)
types.setTypeParser(1700, parseFloat); // NUMERIC/DECIMAL

// Host dashboards' env var boxes are often multi-line textareas — an
// accidental Enter after pasting leaves a trailing newline that breaks DNS
// lookup with a confusing ENOTFOUND. None of these values are ever
// legitimately whitespace, so trimming is always safe.
const pgPool = new Pool({
  host: process.env.DB_HOST?.trim(),
  port: Number(process.env.DB_PORT?.trim()) || 5432,
  user: process.env.DB_USER?.trim(),
  password: process.env.DB_PASSWORD?.trim(),
  database: process.env.DB_NAME?.trim() || 'postgres',
  max: 10,
  ssl: process.env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: false },
});

// This codebase was written against mysql2's interface: `pool.query(sql,
// {namedParams})` resolving to `[rows]`, `result.insertId` on inserts, and
// `pool.getConnection()` for transactions. Rather than rewrite every model
// file for pg's positional-`$1`/no-insertId/BEGIN-COMMIT style, this shim
// reproduces that interface on top of pg — so the query strings are the only
// thing that needed to change (MySQL syntax -> Postgres syntax), not every
// call site.

// Only exact identifiers from schema.sql are quoted — never a generic
// "any camelCase word" regex — so this can't misfire inside a string literal
// or a value. Every identifier below is double-quoted at CREATE TABLE time
// too (see schema.sql), so the two stay in lockstep by construction: this
// list is generated from the same source of truth. (`generate-quoted-list.js`
// prints it if the schema ever grows a new camelCase column.)
const QUOTED_IDENTIFIERS = [
  'passwordHash', 'createdAt', 'updatedAt', 'displayOrder', 'categoryId', 'basePrice',
  'outOfStockDate', 'gstApplicable', 'priceModifier', 'itemId', 'modifierId', 'tableId',
  'totalAmount', 'totalTax', 'openedAt', 'closedAt', 'lastActivityAt', 'mobileIndex',
  'mobileEncrypted', 'totalOrders', 'firstOrderAt', 'lastOrderAt', 'sessionId', 'customerId',
  'customerName', 'cgstAmount', 'sgstAmount', 'taxTotal', 'grandTotal', 'kotPrintedAt',
  'receiptPrintedAt', 'completedAt', 'paidAt', 'orderId', 'variantId', 'variantName',
  'selectedModifiers', 'specialNotes', 'itemPrice', 'itemTotal', 'totalRevenue',
  'totalRefunds', 'dateKey', 'errorMessage', 'printedAt', 'itemName', 'activeCount',
  'sessionStatus', 'idleMinutes', 'callRequestedAt', 'accessToken',
];
const IDENTIFIER_RE = new RegExp(`\\b(${QUOTED_IDENTIFIERS.join('|')})\\b`, 'g');

function quoteIdentifiers(sql) {
  return sql.replace(IDENTIFIER_RE, '"$1"');
}

// Converts mysql2-style `:name` named placeholders (with array values
// auto-expanding to `IN (:ids)` lists) into pg's positional `$1, $2, ...`.
// The negative lookbehind keeps this from matching a Postgres `::type` cast.
function toPositional(sql, params = {}) {
  const values = [];
  const converted = sql.replace(/(?<!:):([a-zA-Z_]\w*)/g, (match, name) => {
    const value = params[name];
    if (Array.isArray(value)) {
      if (value.length === 0) {
        // An empty IN-list matches nothing — write it that way rather than
        // emitting invalid SQL like "IN ()".
        return 'NULL';
      }
      // No wrapping parens here — every call site already writes IN (:name),
      // so the parens are already in the SQL. Adding another pair here would
      // produce IN (($1, $2)), which Postgres parses as a row constructor
      // ("operator does not exist: integer = record"), not a list.
      const placeholders = value.map((v) => {
        values.push(v);
        return `$${values.length}`;
      });
      return placeholders.join(', ');
    }
    values.push(value);
    return `$${values.length}`;
  });
  return { text: converted, values };
}

function toHeaderShape(result) {
  if (result.command === 'SELECT') return [result.rows, result.fields];

  // INSERT/UPDATE/DELETE: mysql2 returns a single header object (not an
  // array) with `.insertId`/`.affectedRows`. RETURNING id (added to every
  // INSERT that needs one) supplies insertId here.
  const header = {
    insertId: result.rows[0]?.id,
    affectedRows: result.rowCount,
    ...result.rows[0],
  };
  return [header, result.fields];
}

async function runQuery(executor, sql, params) {
  // Positional conversion must run first: a param name like :orderId shares
  // its text with the real column "orderId" — quoting before substitution
  // would corrupt the placeholder itself (:orderId -> :"orderId", no longer
  // recognized as a parameter).
  const { text: positional, values } = toPositional(sql, params);
  const text = quoteIdentifiers(positional);
  const result = await executor(text, values);
  return toHeaderShape(result);
}

const pool = {
  query: (sql, params) => runQuery((text, values) => pgPool.query(text, values), sql, params),

  async getConnection() {
    const client = await pgPool.connect();
    return {
      query: (sql, params) => runQuery((text, values) => client.query(text, values), sql, params),
      beginTransaction: () => client.query('BEGIN'),
      commit: () => client.query('COMMIT'),
      rollback: () => client.query('ROLLBACK'),
      release: () => client.release(),
    };
  },
};

module.exports = pool;
