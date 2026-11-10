const axios = require('axios');
const PushToken = require('../models/PushToken');

const copyByType = {
  friend_request: ['Lời mời kết bạn', 'Bạn vừa nhận được lời mời kết bạn.'],
  friend_accepted: ['Đã kết bạn', 'Lời mời kết bạn của bạn đã được chấp nhận.'],
  room_invite: ['Lời mời tham gia nhóm', 'Bạn vừa được mời vào một nhóm hẹn gặp.'],
  room_invite_accepted: ['Thành viên mới', 'Lời mời vào nhóm của bạn đã được chấp nhận.'],
  room_invite_declined: ['Cập nhật lời mời', 'Lời mời vào nhóm của bạn đã bị từ chối.'],
  room_invite_expired: ['Lời mời hết hạn', 'Một lời mời vào nhóm đã hết hạn.'],
};

async function sendPushToUser(userId, notification) {
  const tokens = await PushToken.find({ userId }).select('_id token');
  if (!tokens.length) return;
  const [title, body] = copyByType[notification.type] || ['Điểm Hẹn', 'Bạn có thông báo mới.'];
  const messages = tokens.map(({ token }) => ({
    to: token,
    sound: 'default',
    title,
    body,
    data: {
      type: notification.type,
      groupId: notification.groupId ? String(notification.groupId) : null,
      inviteId: notification.inviteId ? String(notification.inviteId) : null,
      friendshipId: notification.friendshipId ? String(notification.friendshipId) : null,
    },
  }));
  const response = await axios.post('https://exp.host/--/api/v2/push/send', messages, {
    timeout: 8000,
    headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
  });
  const tickets = response.data?.data || [];
  const invalid = tickets.flatMap((ticket, index) => (
    ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' ? [tokens[index]._id] : []
  ));
  if (invalid.length) await PushToken.deleteMany({ _id: { $in: invalid } });
}

module.exports = { sendPushToUser };
