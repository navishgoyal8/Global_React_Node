const express = require('express');
const router = express.Router();
const { getAdsData, generateAgreementLink, updateAgreementDiscount, getAgreementDetails } = require('../controllers/adsPackageController');

router.get('/ads-packages', getAdsData);
router.post('/generate-agreement-link', generateAgreementLink);
router.post('/update-agreement-discount', updateAgreementDiscount);
router.get('/agreement-details', getAgreementDetails);

module.exports = router;