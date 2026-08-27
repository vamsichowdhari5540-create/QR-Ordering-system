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
    `INSERT INTO customers (mobileIndex, mobileEncrypted, name) VALUES (:index, :encrypted, :name)`,
    { index, encrypted, name }
  );
  return result.insertId;
}

function decryptForDisplay(mobileEncrypted) {
  return decryptMobile(mobileEncrypted);
}

module.exports = { findOrCreateCustomer, decryptForDisplay };
