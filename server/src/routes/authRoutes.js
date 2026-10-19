const express = require('express');
const authController = require('../controllers/authController');
const rateLimit = require('express-rate-limit'); // npm i express-rate-limit
const { sendOtp, verifyOtp, googleLogin } = require('../controllers/authController');

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

router.post('/login', authController.login);
router.post('/send-otp', limiter, sendOtp);
router.post('/verify-otp', limiter, verifyOtp);
router.post('/google', limiter, googleLogin);

module.exports = router;
