const menuModel = require('../models/menuModel');

async function getCategories(req, res) {
  const categories = await menuModel.getCategories();
  res.json({ success: true, categories });
}

async function getItems(req, res) {
  const categoryId = Number(req.query.category);
  if (!Number.isInteger(categoryId) || categoryId < 1) {
    return res.status(400).json({ success: false, error: 'category query param is required' });
  }
  const onlyAvailable = req.query.available === 'true';
  const items = await menuModel.getItemsByCategory(categoryId, { onlyAvailable });
  res.json({ success: true, items });
}

// Whole menu, available items only — powers the customer app's search-across-
// categories and lets tab switching happen client-side with no extra fetch.
async function getFullMenu(req, res) {
  const categories = await menuModel.getFullMenuForCustomer();
  res.json({ success: true, categories });
}

module.exports = { getCategories, getItems, getFullMenu };
