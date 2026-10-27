const express = require('express');
const router = express.Router();
const { authRateLimit } = require('../middleware/rateLimits');
const { register, login } = require('../controllers/authController');

router.post('/register', authRateLimit, register);
router.post('/login', authRateLimit, login);

module.exports = router;
