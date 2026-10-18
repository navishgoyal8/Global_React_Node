const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');

router.get('/by-phone/:phone', leadController.getLeadByPhone);

// Save attached vehicles
router.post('/:leadId/vehicles', leadController.saveAssignedVehicles);
router.get('/:leadId/vehicles', leadController.getAssignedVehicles);
router.get('/all', leadController.getAllLeads);
router.get('/check-availability', leadController.getCheckAvailabilityLeads);
router.get('/:leadId/custom-numbers', leadController.getCustomNumbers);
router.post('/:leadId/custom-numbers', leadController.addCustomNumber);


module.exports = router;