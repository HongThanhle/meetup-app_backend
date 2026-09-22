const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const { reverseGeocodeAddress } = require('../controllers/locationController');

router.post('/', verifyToken, reverseGeocodeAddress);

module.exports = router;