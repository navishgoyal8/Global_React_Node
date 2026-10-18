const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');

// router.get('/makes', inventoryController.getMakes);
// router.get('/models/:makeId', inventoryController.getModelsByMake);
router.get('/search-vehicles', inventoryController.getFilteredVehicles);
router.get('/filters', inventoryController.getSearchFilters);

module.exports = router;