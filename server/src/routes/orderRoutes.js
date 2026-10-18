// server/src/routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

// The route called from your React frontend
router.post('/checkout', orderController.processCheckout);

module.exports = router;