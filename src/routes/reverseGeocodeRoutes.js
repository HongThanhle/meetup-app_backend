const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const { reverseGeocodeAddress } = require('../controllers/locationController');
const { expensiveRequestRateLimit } = require('../middleware/rateLimits');

router.post('/', verifyToken, expensiveRequestRateLimit, reverseGeocodeAddress);

module.exports = router;
