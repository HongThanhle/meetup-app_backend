const express = require('express');
const verifyToken = require('../middleware/authMiddleware');
const {
  listNotifications,
  getUnreadCount,
  markAllNotificationsRead,
} = require('../controllers/notificationController');

const router = express.Router();

router.use(verifyToken);
router.get('/unread-count', getUnreadCount);
router.get('/', listNotifications);
router.patch('/read-all', markAllNotificationsRead);

module.exports = router;
