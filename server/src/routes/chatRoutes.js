const express = require('express');
const router = express.Router();

const twilioController = require('../controllers/twilioController');

router.get('/twilio-inbox', twilioController.getLiveTwilioInbox);
router.get('/twilio/thread-history', twilioController.getThreadHistory);
router.post('/twilio/send', twilioController.sendTwilioMessage);
router.post('/twilio/webhook', twilioController.receiveTwilioWebhook);
router.post('/twilio/call', twilioController.initiateCall);
router.post('/twilio/lead-history', twilioController.getLeadCallHistory);

module.exports = router;