const router = require('express').Router();
const consignmentController = require('../controllers/consignmentController');
// const { authenticate } = require('../middleware/auth'); // use your existing auth middleware

// Agent (CRM) routes
router.post('/', consignmentController.saveAndSend);
router.get('/', consignmentController.listByInvoice);
router.post('/by-vehicle/void', consignmentController.voidForVehicle);
router.delete('/:id', consignmentController.remove);

// Public seller routes (the token is the credential)
router.get('/public/:token', consignmentController.getByToken);
router.post('/public/:token/sign', consignmentController.sign);

module.exports = router;