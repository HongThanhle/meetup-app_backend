const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const { geocodePreview } = require('../controllers/locationController');

router.post('/', verifyToken, geocodePreview);

module.exports = router;
