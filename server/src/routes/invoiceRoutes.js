const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');

router.post('/generate-link', invoiceController.generateAndSendPayLink);
router.post('/checkout-links', invoiceController.generateCheckoutLinks);
router.post('/create', invoiceController.createInvoice);
router.get('/check/:userId', invoiceController.checkInvoiceStatus);

// ✅ ADD THESE TWO NEW ROUTES FOR THE EDIT SCREEN
router.get('/details/:invoiceId', invoiceController.getInvoiceDetails);
router.get('/schedules/:invoiceId', invoiceController.getScheduledMessages);
router.get('/list', invoiceController.getAllInvoices);
router.delete('/:invoiceId', invoiceController.deleteInvoice);
router.post('/charge', invoiceController.chargeInvoice);
router.get('/coupon/:code', invoiceController.getCouponDetails);
router.get('/by-contact', invoiceController.getInvoicesByContact);

module.exports = router;