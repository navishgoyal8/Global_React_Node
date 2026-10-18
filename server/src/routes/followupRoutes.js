const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/followupController');

router.post('/create', ctrl.createFollowup);
router.get('/by-invoice/:invoiceId', ctrl.listByInvoice);
router.get('/by-phone/:phone', ctrl.listByPhone);
router.put('/update-status', ctrl.updateStatus);
router.put('/:id', ctrl.updateFollowup);
router.delete('/:id', ctrl.deleteFollowup);
router.get('/check-due', ctrl.checkDueReminders);
router.get('/triggered', ctrl.listTriggered);
router.put('/triggered/:id/dismiss', ctrl.dismissTriggered);

module.exports = router;
