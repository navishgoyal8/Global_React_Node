// server/src/routes/uploadRoutes.js
const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');

// Logo uploads travel as base64 JSON — lift the default 100kb body limit.
router.use(express.json({ limit: '15mb' }));

router.post('/apparel-logo', uploadController.uploadApparelLogo);

module.exports = router;