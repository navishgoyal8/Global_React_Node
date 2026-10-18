const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');

// Define the GET route
router.get('/', productController.getAllProducts);
// Add this line where your other GET routes are!
router.get('/store-filters', productController.getStoreFilters);
router.get('/:id/variants', productController.getProductVariants);
router.get('/:id', productController.getProductById);

module.exports = router;