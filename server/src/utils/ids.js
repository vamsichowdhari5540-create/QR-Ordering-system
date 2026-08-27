// Order IDs: ORD-DDMM-NNN, sequence resets daily via order_sequences table.
async function nextOrderId(conn) {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dateKey = `${dd}${mm}`;

  await conn.query(
    `INSERT INTO order_sequences (dateKey, seq) VALUES (:dateKey, 1)
     ON DUPLICATE KEY UPDATE seq = seq + 1`,
    { dateKey }
  );
  const [rows] = await conn.query(
    'SELECT seq FROM order_sequences WHERE dateKey = :dateKey',
    { dateKey }
  );
  const seq = String(rows[0].seq).padStart(3, '0');
  return `ORD-${dateKey}-${seq}`;
}

// Session IDs: sess_<timestamp>_<table>, unique per re-seating.
function newSessionId(tableId) {
  return `sess_${Date.now()}_${tableId}`;
}

module.exports = { nextOrderId, newSessionId };
