const Notification = require('../models/Notification');
const { serializeNotification } = require('../services/notificationService');
const { emitToUser } = require('../realtime/socketHub');

async function listNotifications(req, res) {
  try {
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ userId: req.userId }).sort({ createdAt: -1 }),
      Notification.countDocuments({ userId: req.userId, readAt: null }),
    ]);
    const items = notifications.map(serializeNotification);
    res.json({
      unreadCount,
      notifications: items,
    });
  } catch (error) {
    console.error('Lỗi lấy thông báo:', error);
    res.status(500).json({ error: 'Không thể tải thông báo' });
  }
}

async function getUnreadCount(req, res) {
  try {
    const unreadCount = await Notification.countDocuments({ userId: req.userId, readAt: null });
    res.json({ unreadCount });
  } catch (error) {
    console.error('Lỗi đếm thông báo chưa đọc:', error);
    res.status(500).json({ error: 'Không thể tải số thông báo chưa đọc' });
  }
}

async function markAllNotificationsRead(req, res) {
  try {
    const result = await Notification.updateMany(
      { userId: req.userId, readAt: null },
      { $set: { readAt: new Date() } }
    );
    if (result.modifiedCount > 0) {
      emitToUser(req.userId, 'notification:updated', { userId: String(req.userId) });
    }
    res.json({ markedCount: result.modifiedCount });
  } catch (error) {
    console.error('Lỗi đánh dấu thông báo đã đọc:', error);
    res.status(500).json({ error: 'Không thể cập nhật trạng thái thông báo' });
  }
}

module.exports = { listNotifications, getUnreadCount, markAllNotificationsRead };
