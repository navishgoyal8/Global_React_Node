const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');

router.post('/send-pay-link', emailController.sendEmail);

module.exports = router;