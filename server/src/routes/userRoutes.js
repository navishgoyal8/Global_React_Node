const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

router.post('/create', userController.createUser);
router.put('/update',userController.updateLeadPreferences);
router.get('/system-users', userController.getAllSystemUsers);
router.get('/listings-memberships', userController.getListingsAndMemberships);
router.get('/:id/listings', userController.getUserListings);
// router.post('/create', userController.createLead);

module.exports = router;