const router = require('express').Router();
const referralController = require('../controllers/referralController');
// const { authenticate } = require('../middleware/auth'); // Add auth middleware if using it

// ── Agent (CRM) routes ──
router.post('/send', referralController.saveAndSendReferral);
router.get('/', referralController.listByInvoice);
router.delete('/:id', referralController.remove);
router.post('/by-vehicle/void', referralController.voidForVehicle);
router.post('/upload-pdf', referralController.uploadPdf);

// ── Public customer routes (the token acts as the credential) ──
router.get('/public/:token', referralController.getByToken);
router.post('/public/:token/sign', referralController.sign);

module.exports = router;