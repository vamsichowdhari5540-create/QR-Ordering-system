const express = require('express');
const menuController = require('../controllers/menuController');

const router = express.Router();

router.get('/categories', menuController.getCategories);
router.get('/items', menuController.getItems);
router.get('/full', menuController.getFullMenu);

module.exports = router;
