const express = require('express');
const router = express.Router();
const { authRateLimit, deleteAccountRateLimit } = require('../middleware/rateLimits');
const verifyToken = require('../middleware/authMiddleware');
const { register, login } = require('../controllers/authController');
const { deleteMyAccount, requestAccountDeletion } = require('../controllers/accountController');

router.post('/register', authRateLimit, register);
router.post('/login', authRateLimit, login);
router.delete('/me', verifyToken, deleteAccountRateLimit, deleteMyAccount);
router.post('/account-deletion', deleteAccountRateLimit, requestAccountDeletion);

module.exports = router;
