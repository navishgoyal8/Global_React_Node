// server/src/routes/uploadRoutes.js
const express = require('express');
const multer = require('multer');
const router = express.Router();
const uploadController = require('../controllers/uploadController');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) =>
        /^image\/(png|jpeg|webp|svg\+xml)$/.test(file.mimetype)
            ? cb(null, true)
            : cb(new Error('Unsupported file type')),
 })


router.post('/apparel-logo', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    res.status(tooBig ? 413 : 400).json({ success: false, message: tooBig ? 'File too large.' : err.message });
  });
}, uploadController.uploadApparelLogo);


module.exports = router;