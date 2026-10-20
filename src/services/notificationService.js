const Notification = require('../models/Notification');
const { emitToUser } = require('../realtime/socketHub');

const ACTIONABLE_TYPES = new Set(['friend_request', 'room_invite']);

function serializeNotification(notification) {
  return {
    notificationId: String(notification._id),
    type: notification.type,
    actorId: notification.actorId ? String(notification.actorId) : null,
    actorName: notification.actorName,
    friendshipId: notification.friendshipId ? String(notification.friendshipId) : null,
    inviteId: notification.inviteId ? String(notification.inviteId) : null,
    groupId: notification.groupId ? String(notification.groupId) : null,
    groupName: notification.groupName || null,
    createdAt: notification.createdAt,
    readAt: notification.readAt,
    resolvedAt: notification.resolvedAt,
    resolution: notification.resolution || null,
    actionable: ACTIONABLE_TYPES.has(notification.type) && !notification.resolvedAt,
  };
}

async function createNotification(details) {
  const notification = await Notification.create(details);
  emitToUser(details.userId, 'notification:new', serializeNotification(notification));
  return notification;
}

async function resolveNotification(filter, resolution = null) {
  const resolvedAt = new Date();
  const result = await Notification.updateMany(
    { ...filter, resolvedAt: null },
    { $set: { resolvedAt, resolution } }
  );
  if (result.modifiedCount > 0 && filter.userId) {
    emitToUser(filter.userId, 'notification:updated', { userId: String(filter.userId) });
  }
}

module.exports = { createNotification, resolveNotification, serializeNotification };
