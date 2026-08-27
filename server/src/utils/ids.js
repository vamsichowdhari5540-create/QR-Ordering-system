const { TODAY } = require('./businessDay');

// Order IDs: ORD-DDMM-NNN, sequence resets daily via order_sequences table.
// dateKey comes from the restaurant's local calendar day, not Node's clock
// or the database's UTC one — an order placed after midnight IST must land
// in that day's sequence, not the previous UTC day's.
async function nextOrderId(conn) {
  const [{ dateKey, seq }] = await conn.query(
    `INSERT INTO order_sequences (dateKey, seq)
     VALUES (TO_CHAR(${TODAY}, 'DDMM'), 1)
     ON CONFLICT (dateKey) DO UPDATE SET seq = order_sequences.seq + 1
     RETURNING dateKey, seq`
  );
  return `ORD-${dateKey}-${String(seq).padStart(3, '0')}`;
}

// Session IDs: sess_<timestamp>_<table>, unique per re-seating.
function newSessionId(tableId) {
  return `sess_${Date.now()}_${tableId}`;
}

module.exports = { nextOrderId, newSessionId };
