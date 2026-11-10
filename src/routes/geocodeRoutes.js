const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const { geocodePreview } = require('../controllers/locationController');
const { expensiveRequestRateLimit } = require('../middleware/rateLimits');

router.post('/', verifyToken, expensiveRequestRateLimit, geocodePreview);

module.exports = router;
