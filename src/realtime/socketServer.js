const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const Presence = require('../models/Presence');
const RoomInvite = require('../models/RoomInvite');
const Group = require('../models/Group');
const { setSocketServer, emitToUser } = require('./socketHub');

const HEARTBEAT_TIMEOUT_MS = 75 * 1000;
const DISCONNECT_GRACE_MS = 2500;
const PRESENCE_SWEEP_MS = 30 * 1000;
const userSockets = new Map();
const disconnectTimers = new Map();

async function getAcceptedFriendIds(userId) {
  const friendships = await Friendship.find({
    status: 'accepted',
    $or: [{ userA: userId }, { userB: userId }],
  }).select('userA userB');
  return friendships.map((friendship) => (
    String(friendship.userA) === String(userId) ? friendship.userB : friendship.userA
  ));
}

async function emitPresence(userId, status, lastSeenAt = new Date()) {
  try {
    const friendIds = await getAcceptedFriendIds(userId);
    const payload = { userId: String(userId), status, lastSeenAt };
    friendIds.forEach((friendId) => emitToUser(friendId, 'presence:update', payload));
  } catch (error) {
    console.error('Không thể phát trạng thái online:', error.message);
  }
}

async function setUserOnline(userId) {
  const now = new Date();
  await Presence.findOneAndUpdate(
    { userId },
    { $set: { status: 'online', lastSeenAt: now } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await emitPresence(userId, 'online', now);
}

async function setUserOffline(userId) {
  if (userSockets.has(String(userId))) return;
  const now = new Date();
  await Presence.findOneAndUpdate(
    { userId },
    { $set: { status: 'offline', lastSeenAt: now } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await emitPresence(userId, 'offline', now);
}

function initializeSocketServer(httpServer) {
  const socketServer = new Server(httpServer, {
    cors: { origin: true, methods: ['GET', 'POST'] },
    pingInterval: 25000,
    pingTimeout: 20000,
  });
  setSocketServer(socketServer);

  socketServer.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string' || !token) {
        return next(new Error('Chưa đăng nhập'));
      }
      if (!process.env.JWT_SECRET) {
        return next(new Error('Máy chủ chưa cấu hình xác thực realtime'));
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded.userId || !(await User.exists({ _id: decoded.userId }))) {
        return next(new Error('Tài khoản không tồn tại'));
      }
      socket.data.userId = String(decoded.userId);
      return next();
    } catch (error) {
      return next(new Error('Token không hợp lệ hoặc đã hết hạn'));
    }
  });

  socketServer.on('connection', async (socket) => {
    const userId = socket.data.userId;
    const pendingDisconnect = disconnectTimers.get(userId);
    if (pendingDisconnect) {
      clearTimeout(pendingDisconnect);
      disconnectTimers.delete(userId);
    }

    const sockets = userSockets.get(userId) || new Set();
    sockets.add(socket.id);
    userSockets.set(userId, sockets);
    socket.join(`user:${userId}`);

    try {
      await setUserOnline(userId);
      const friendIds = await getAcceptedFriendIds(userId);
      const presences = await Presence.find({
        userId: { $in: friendIds },
        status: 'online',
        lastSeenAt: { $gte: new Date(Date.now() - HEARTBEAT_TIMEOUT_MS) },
      }).select('userId status lastSeenAt');
      socket.emit('presence:snapshot', presences.map((presence) => ({
        userId: String(presence.userId),
        status: presence.status,
        lastSeenAt: presence.lastSeenAt,
      })));
    } catch (error) {
      console.error('Không thể cập nhật trạng thái kết nối:', error.message);
    }

    socket.on('presence:heartbeat', async () => {
      try {
        const now = new Date();
        await Presence.findOneAndUpdate(
          { userId },
          { $set: { status: 'online', lastSeenAt: now } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } catch (error) {
        console.error('Không thể cập nhật heartbeat:', error.message);
      }
    });

    socket.on('disconnect', () => {
      const activeSockets = userSockets.get(userId);
      activeSockets?.delete(socket.id);
      if (activeSockets?.size) return;
      userSockets.delete(userId);
      const timer = setTimeout(async () => {
        disconnectTimers.delete(userId);
        try {
          await setUserOffline(userId);
        } catch (error) {
          console.error('Không thể cập nhật trạng thái offline:', error.message);
        }
      }, DISCONNECT_GRACE_MS);
      disconnectTimers.set(userId, timer);
    });
  });

  const stalePresenceTimer = setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);
      const staleUsers = await Presence.find({
        status: 'online',
        lastSeenAt: { $lt: cutoff },
      }).select('userId');
      if (!staleUsers.length) return;
      await Presence.updateMany(
        { userId: { $in: staleUsers.map((presence) => presence.userId) }, status: 'online' },
        { $set: { status: 'offline' } }
      );
      await Promise.all(staleUsers.map((presence) => (
        emitPresence(presence.userId, 'offline', new Date())
      )));
    } catch (error) {
      console.error('Không thể dọn presence cũ:', error.message);
    }
  }, PRESENCE_SWEEP_MS);
  stalePresenceTimer.unref();

  const expiredInviteTimer = setInterval(async () => {
    try {
      const now = new Date();
      const expiredInvites = await RoomInvite.find({
        status: 'pending',
        expiresAt: { $lte: now },
      }).select('_id fromUser toUser groupId');
      if (!expiredInvites.length) return;
      await RoomInvite.updateMany(
        { _id: { $in: expiredInvites.map((invite) => invite._id) }, status: 'pending' },
        { $set: { status: 'expired' } }
      );
      expiredInvites.forEach((invite) => {
        const payload = { inviteId: String(invite._id), status: 'expired' };
        emitToUser(invite.fromUser, 'room:invite_updated', payload);
        emitToUser(invite.toUser, 'room:invite_updated', payload);
      });
    } catch (error) {
      console.error('Không thể dọn lời mời phòng hết hạn:', error.message);
    }
  }, PRESENCE_SWEEP_MS);
  expiredInviteTimer.unref();

  return socketServer;
}

async function emitToGroupMembers(groupId, event, payload) {
  try {
    const group = await Group.findById(groupId).select('members.userId');
    if (!group) return;
    group.members.forEach((member) => emitToUser(member.userId, event, payload));
  } catch (error) {
    console.error('Không thể phát sự kiện cho thành viên nhóm:', error.message);
  }
}

module.exports = { initializeSocketServer, emitToGroupMembers };
