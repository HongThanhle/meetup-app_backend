const Notification = require('../models/Notification');
const mongoose = require('mongoose');
const { serializeNotification } = require('../services/notificationService');
const { emitToUser } = require('../realtime/socketHub');

async function listNotifications(req, res) {
  try {
    const limit = Number(req.query.limit || 20);
    const { beforeCreatedAt, beforeId } = req.query;
    const unreadOnly = req.query.unreadOnly === 'true';
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      return res.status(400).json({ error: 'Số lượng thông báo mỗi trang không hợp lệ' });
    }
    if (req.query.unreadOnly != null && !['true', 'false'].includes(req.query.unreadOnly)) {
      return res.status(400).json({ error: 'Bộ lọc thông báo không hợp lệ' });
    }
    if ((beforeCreatedAt && !beforeId) || (!beforeCreatedAt && beforeId)) {
      return res.status(400).json({ error: 'Con trỏ phân trang không hợp lệ' });
    }

    const query = { userId: req.userId };
    if (unreadOnly) query.readAt = null;
    if (beforeCreatedAt) {
      const cursorDate = new Date(beforeCreatedAt);
      if (
        Number.isNaN(cursorDate.getTime())
        || !mongoose.Types.ObjectId.isValid(beforeId)
      ) {
        return res.status(400).json({ error: 'Con trỏ phân trang không hợp lệ' });
      }
      query.$or = [
        { createdAt: { $lt: cursorDate } },
        { createdAt: cursorDate, _id: { $lt: beforeId } },
      ];
    }

    const [notifications, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit + 1),
      Notification.countDocuments({ userId: req.userId, readAt: null }),
    ]);
    const hasMore = notifications.length > limit;
    const page = hasMore ? notifications.slice(0, limit) : notifications;
    const lastNotification = page[page.length - 1];
    res.json({
      unreadCount,
      notifications: page.map(serializeNotification),
      hasMore,
      nextCursor: hasMore && lastNotification
        ? {
          beforeCreatedAt: lastNotification.createdAt,
          beforeId: String(lastNotification._id),
        }
        : null,
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
