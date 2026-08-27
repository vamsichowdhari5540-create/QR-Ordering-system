const pool = require('../config/db');
const { TODAY } = require('../utils/businessDay');

async function getCategories() {
  const [rows] = await pool.query(
    'SELECT id, name, displayOrder FROM categories WHERE active = TRUE ORDER BY displayOrder, name'
  );
  return rows;
}

async function getItemsByCategory(categoryId, { onlyAvailable = false } = {}) {
  let sql = `SELECT id, categoryId, name, description, basePrice, image, displayOrder,
                    (outOfStockDate IS NULL OR outOfStockDate <> ${TODAY}) AS available
             FROM items WHERE categoryId = :categoryId AND active = TRUE`;
  if (onlyAvailable) sql += ` AND (outOfStockDate IS NULL OR outOfStockDate <> ${TODAY})`;
  sql += ' ORDER BY displayOrder, name';
  const [items] = await pool.query(sql, { categoryId });
  if (items.length === 0) return items;

  const itemIds = items.map((i) => i.id);
  const [variants] = await pool.query(
    `SELECT id, itemId, name, priceModifier FROM item_variants
     WHERE itemId IN (:itemIds) AND active = TRUE ORDER BY displayOrder`,
    { itemIds }
  );
  const [modifiers] = await pool.query(
    `SELECT id, itemId, name, type, priceModifier FROM item_modifiers
     WHERE itemId IN (:itemIds) AND active = TRUE ORDER BY displayOrder`,
    { itemIds }
  );
  const modifierIds = modifiers.map((m) => m.id);
  let options = [];
  if (modifierIds.length > 0) {
    const [optRows] = await pool.query(
      `SELECT id, modifierId, name, priceModifier FROM modifier_options
       WHERE modifierId IN (:modifierIds) ORDER BY displayOrder`,
      { modifierIds }
    );
    options = optRows;
  }

  return items.map((item) => ({
    ...item,
    available: !!item.available,
    variants: variants.filter((v) => v.itemId === item.id),
    modifiers: modifiers
      .filter((m) => m.itemId === item.id)
      .map((m) => ({ ...m, options: options.filter((o) => o.modifierId === m.id) })),
  }));
}

async function getItemById(itemId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT id, name, basePrice, gstApplicable,
            (outOfStockDate IS NULL OR outOfStockDate <> ${TODAY}) AS available
     FROM items WHERE id = :itemId`,
    { itemId }
  );
  return rows[0] || null;
}

async function getVariantById(variantId, conn = pool) {
  if (!variantId) return null;
  const [rows] = await conn.query(
    'SELECT id, itemId, name, priceModifier FROM item_variants WHERE id = :variantId AND active = TRUE',
    { variantId }
  );
  return rows[0] || null;
}

// available=false marks the item out of stock for today only — the flag clears itself
// automatically the next calendar day, no scheduled job required.
async function setItemAvailability(itemId, available) {
  const sql = available
    ? 'UPDATE items SET outOfStockDate = NULL WHERE id = :itemId'
    : `UPDATE items SET outOfStockDate = ${TODAY} WHERE id = :itemId`;
  await pool.query(sql, { itemId });
  const [rows] = await pool.query(
    `SELECT id, name, (outOfStockDate IS NULL OR outOfStockDate <> ${TODAY}) AS available
     FROM items WHERE id = :itemId`,
    { itemId }
  );
  return rows[0] || null;
}

// Full menu for the admin "Today's Menu" screen — every active item, every category, unfiltered.
async function getFullMenuForAdmin() {
  const categories = await getCategories();
  const itemsByCategory = await Promise.all(
    categories.map((c) => getItemsByCategory(c.id))
  );
  return categories.map((c, i) => ({ ...c, items: itemsByCategory[i] }));
}

// Full menu for the customer ordering screen — same shape, but only items
// available right now, so a single fetch can drive both tab browsing and a
// search that spans every category at once (no per-tab round trip).
async function getFullMenuForCustomer() {
  const categories = await getCategories();
  const itemsByCategory = await Promise.all(
    categories.map((c) => getItemsByCategory(c.id, { onlyAvailable: true }))
  );
  return categories.map((c, i) => ({ ...c, items: itemsByCategory[i] }));
}

async function createCategory({ name, displayOrder }) {
  const [result] = await pool.query(
    'INSERT INTO categories (name, displayOrder) VALUES (:name, :displayOrder) RETURNING id',
    { name, displayOrder: displayOrder || 0 }
  );
  return result.insertId;
}

async function updateCategory(id, { name, displayOrder, active }) {
  await pool.query(
    `UPDATE categories SET
       name = COALESCE(:name, name),
       displayOrder = COALESCE(:displayOrder, displayOrder),
       active = COALESCE(:active, active)
     WHERE id = :id`,
    { id, name: name ?? null, displayOrder: displayOrder ?? null, active: active ?? null }
  );
}

async function createItem({ categoryId, name, description, basePrice, displayOrder, variants, modifiers }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO items (categoryId, name, description, basePrice, displayOrder)
       VALUES (:categoryId, :name, :description, :basePrice, :displayOrder) RETURNING id`,
      { categoryId, name, description: description || null, basePrice, displayOrder: displayOrder || 0 }
    );
    const itemId = result.insertId;

    for (const [i, v] of (variants || []).entries()) {
      await conn.query(
        'INSERT INTO item_variants (itemId, name, priceModifier, displayOrder) VALUES (:itemId, :name, :priceModifier, :i)',
        { itemId, name: v.name, priceModifier: v.priceModifier || 0, i }
      );
    }

    for (const [i, m] of (modifiers || []).entries()) {
      const [modResult] = await conn.query(
        'INSERT INTO item_modifiers (itemId, name, type, displayOrder) VALUES (:itemId, :name, :type, :i) RETURNING id',
        { itemId, name: m.name, type: m.type || 'RADIO', i }
      );
      const modifierId = modResult.insertId;
      for (const [j, optName] of (m.options || []).entries()) {
        await conn.query(
          'INSERT INTO modifier_options (modifierId, name, displayOrder) VALUES (:modifierId, :name, :j)',
          { modifierId, name: optName, j }
        );
      }
    }

    await conn.commit();
    return itemId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function updateItem(id, { name, description, basePrice, displayOrder, active }) {
  await pool.query(
    `UPDATE items SET
       name = COALESCE(:name, name),
       description = COALESCE(:description, description),
       basePrice = COALESCE(:basePrice, basePrice),
       displayOrder = COALESCE(:displayOrder, displayOrder),
       active = COALESCE(:active, active)
     WHERE id = :id`,
    {
      id,
      name: name ?? null,
      description: description ?? null,
      basePrice: basePrice ?? null,
      displayOrder: displayOrder ?? null,
      active: active ?? null,
    }
  );
}

module.exports = {
  getCategories,
  getItemsByCategory,
  getItemById,
  getVariantById,
  setItemAvailability,
  getFullMenuForAdmin,
  getFullMenuForCustomer,
  createCategory,
  updateCategory,
  createItem,
  updateItem,
};
