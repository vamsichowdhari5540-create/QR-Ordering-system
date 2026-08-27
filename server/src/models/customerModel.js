const { mobileIndex, encryptMobile, decryptMobile } = require('../utils/crypto');

async function findOrCreateCustomer(conn, { name, mobile }) {
  const index = mobileIndex(mobile);
  const [existing] = await conn.query(
    'SELECT id FROM customers WHERE mobileIndex = :index',
    { index }
  );

  if (existing.length > 0) {
    const customerId = existing[0].id;
    await conn.query(
      `UPDATE customers SET name = :name, totalOrders = totalOrders + 1, lastOrderAt = NOW()
       WHERE id = :customerId`,
      { customerId, name }
    );
    return customerId;
  }

  const encrypted = encryptMobile(mobile);
  const [result] = await conn.query(
    `INSERT INTO customers (mobileIndex, mobileEncrypted, name) VALUES (:index, :encrypted, :name) RETURNING id`,
    { index, encrypted, name }
  );
  return result.insertId;
}

// The phone number is a convenience line on a receipt; settling the bill is
// the operation that actually matters. A record this server can't decrypt
// (written under a different ENCRYPTION_KEY — a second environment sharing
// the same database, or a key rotated without re-encrypting) must not take
// the whole settle down with it, which would leave staff unable to close out
// a table at all.
function decryptForDisplay(mobileEncrypted) {
  try {
    return decryptMobile(mobileEncrypted);
  } catch {
    console.error('Could not decrypt a stored mobile number — check ENCRYPTION_KEY matches the one that wrote it.');
    return 'N/A';
  }
}

module.exports = { findOrCreateCustomer, decryptForDisplay };
