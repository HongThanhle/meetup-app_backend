const mongoose = require('mongoose');
const Friendship = require('../models/Friendship');
const Presence = require('../models/Presence');
const RoomInvite = require('../models/RoomInvite');
const Group = require('../models/Group');
const User = require('../models/User');
const { emitToUser } = require('../realtime/socketHub');
const { emitToGroupMembers } = require('../realtime/socketServer');
const { createNotification, resolveNotification } = require('../services/notificationService');

const requestAttempts = new Map();
const inviteAttempts = new Map();
const INVITE_TTL_MS = 5 * 60 * 1000;

function orderedPair(firstId, secondId) {
  return [String(firstId), String(secondId)].sort();
}

function isRateLimited(store, key, limit, windowMs) {
  const now = Date.now();
  const activeAttempts = (store.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
  if (activeAttempts.length >= limit) {
    store.set(key, activeAttempts);
    return true;
  }
  activeAttempts.push(now);
  store.set(key, activeAttempts);
  return false;
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

async function listFriends(req, res) {
  try {
    const friendships = await Friendship.find({
      status: 'accepted',
      $or: [{ userA: req.userId }, { userB: req.userId }],
    }).select('_id userA userB');
    const friendIds = friendships.map((friendship) => (
      String(friendship.userA) === String(req.userId) ? friendship.userB : friendship.userA
    ));
    const friendshipIdByFriendId = new Map(friendships.map((friendship) => {
      const friendId = String(friendship.userA) === String(req.userId)
        ? friendship.userB
        : friendship.userA;
      return [String(friendId), String(friendship._id)];
    }));
    const [users, presences, incomingRequests, outgoingRequests, pendingInvites] = await Promise.all([
      User.find({ _id: { $in: friendIds } }).select('name'),
      Presence.find({
        userId: { $in: friendIds },
        status: 'online',
        lastSeenAt: { $gte: new Date(Date.now() - 75 * 1000) },
      }).select('userId status lastSeenAt'),
      Friendship.find({
        status: 'pending',
        requestedBy: { $ne: req.userId },
        $or: [{ userA: req.userId }, { userB: req.userId }],
      }).populate('requestedBy', 'name'),
      Friendship.find({
        status: 'pending',
        requestedBy: req.userId,
        $or: [{ userA: req.userId }, { userB: req.userId }],
      }).populate('userA userB', 'name'),
      RoomInvite.find({
        toUser: req.userId,
        status: 'pending',
        expiresAt: { $gt: new Date() },
      }).populate('fromUser', 'name').populate('groupId', 'groupName'),
    ]);

    const usersById = new Map(users.map((user) => [String(user._id), user]));
    const presenceById = new Map(presences.map((presence) => [String(presence.userId), presence]));
    const friends = friendIds.map((friendId) => {
      const friend = usersById.get(String(friendId));
      const presence = presenceById.get(String(friendId));
      return {
        userId: String(friendId),
        friendshipId: friendshipIdByFriendId.get(String(friendId)),
        name: friend?.name || 'Người dùng',
        status: presence ? 'online' : 'offline',
        lastSeenAt: presence?.lastSeenAt || null,
      };
    }).sort((first, second) => (
      Number(second.status === 'online') - Number(first.status === 'online')
      || first.name.localeCompare(second.name, 'vi')
    ));

    res.json({
      friends,
      incomingRequests: incomingRequests.map((request) => ({
        friendshipId: String(request._id),
        userId: String(request.requestedBy._id),
        name: request.requestedBy.name,
      })),
      outgoingRequests: outgoingRequests.map((request) => {
        const target = String(request.userA._id) === String(req.userId) ? request.userB : request.userA;
        return {
          friendshipId: String(request._id),
          userId: String(target._id),
          name: target.name,
        };
      }),
      pendingInvites: pendingInvites.filter((invite) => invite.groupId && invite.fromUser).map((invite) => ({
        inviteId: String(invite._id),
        groupId: String(invite.groupId._id),
        groupName: invite.groupId.groupName,
        fromUserId: String(invite.fromUser._id),
        fromUserName: invite.fromUser.name,
        expiresAt: invite.expiresAt,
      })),
    });
  } catch (error) {
    console.error('Lỗi lấy danh sách bạn bè:', error);
    res.status(500).json({ error: 'Không thể tải danh sách bạn bè' });
  }
}

async function sendFriendRequest(req, res) {
  try {
    const { targetUserId } = req.body;
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (targetUserId && !isValidObjectId(targetUserId)) {
      return res.status(400).json({ error: 'Tài khoản cần kết bạn không hợp lệ' });
    }
    if (!targetUserId && (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      return res.status(400).json({ error: 'Email không hợp lệ' });
    }
    if (isRateLimited(requestAttempts, String(req.userId), 20, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Bạn gửi quá nhiều lời mời kết bạn. Vui lòng thử lại sau.' });
    }

    const [requester, recipient] = await Promise.all([
      User.findById(req.userId).select('name'),
      targetUserId
        ? User.findById(targetUserId).select('name')
        : User.findOne({ email }).select('name'),
    ]);
    if (!requester) return res.status(401).json({ error: 'Tài khoản không tồn tại' });
    if (!recipient) return res.status(404).json({ error: 'Không tìm thấy tài khoản cần kết bạn' });
    if (String(recipient._id) === String(req.userId)) {
      return res.status(400).json({ error: 'Bạn không thể tự gửi lời mời kết bạn' });
    }

    const [userA, userB] = orderedPair(req.userId, recipient._id);
    let friendship = await Friendship.findOne({ userA, userB });
    if (friendship?.status === 'accepted') {
      return res.status(409).json({ error: 'Hai bạn đã là bạn bè' });
    }
    if (friendship?.status === 'pending') {
      if (String(friendship.requestedBy) === String(req.userId)) {
        return res.status(409).json({ error: 'Lời mời kết bạn đã được gửi trước đó' });
      }
      friendship.status = 'accepted';
      await friendship.save();
      await resolveNotification({
        userId: req.userId,
        type: 'friend_request',
        friendshipId: friendship._id,
      }, 'accepted');
      await createNotification({
        userId: recipient._id,
        actorId: req.userId,
        actorName: requester.name,
        type: 'friend_accepted',
        friendshipId: friendship._id,
      });
      const payload = {
        friendshipId: String(friendship._id),
        userId: String(req.userId),
        name: requester.name,
      };
      emitToUser(recipient._id, 'friend:accepted', payload);
      emitToUser(req.userId, 'friend:accepted', {
        friendshipId: String(friendship._id),
        userId: String(recipient._id),
        name: recipient.name,
      });
      return res.json({ message: 'Hai bạn đã trở thành bạn bè', accepted: true });
    }

    friendship = await Friendship.create({
      userA,
      userB,
      requestedBy: req.userId,
      status: 'pending',
    });
    await createNotification({
      userId: recipient._id,
      actorId: req.userId,
      actorName: requester.name,
      type: 'friend_request',
      friendshipId: friendship._id,
    });
    emitToUser(recipient._id, 'friend:request', {
      friendshipId: String(friendship._id),
      userId: String(req.userId),
      name: requester.name,
    });
    res.status(201).json({ message: 'Đã gửi lời mời kết bạn' });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Lời mời kết bạn đã tồn tại' });
    }
    console.error('Lỗi gửi lời mời kết bạn:', error);
    res.status(500).json({ error: 'Không thể gửi lời mời kết bạn' });
  }
}

async function acceptFriendRequest(req, res) {
  try {
    if (!isValidObjectId(req.params.friendshipId)) {
      return res.status(400).json({ error: 'Lời mời kết bạn không hợp lệ' });
    }
    const friendship = await Friendship.findOneAndUpdate(
      {
        _id: req.params.friendshipId,
        status: 'pending',
        requestedBy: { $ne: req.userId },
        $or: [{ userA: req.userId }, { userB: req.userId }],
      },
      { $set: { status: 'accepted' } },
      { new: true }
    );
    if (!friendship) return res.status(404).json({ error: 'Không tìm thấy lời mời đang chờ' });

    const otherUserId = String(friendship.userA) === String(req.userId)
      ? friendship.userB
      : friendship.userA;
    const user = await User.findById(req.userId).select('name');
    const otherUser = await User.findById(otherUserId).select('name');
    await resolveNotification({
      userId: req.userId,
      type: 'friend_request',
      friendshipId: friendship._id,
    }, 'accepted');
    await createNotification({
      userId: otherUserId,
      actorId: req.userId,
      actorName: user?.name || 'Người dùng',
      type: 'friend_accepted',
      friendshipId: friendship._id,
    });
    emitToUser(otherUserId, 'friend:accepted', {
      friendshipId: String(friendship._id),
      userId: String(req.userId),
      name: user?.name || 'Người dùng',
    });
    emitToUser(req.userId, 'friend:accepted', {
      friendshipId: String(friendship._id),
      userId: String(otherUserId),
      name: otherUser?.name || 'Người dùng',
    });
    res.json({ message: 'Đã chấp nhận lời mời kết bạn' });
  } catch (error) {
    console.error('Lỗi chấp nhận lời mời kết bạn:', error);
    res.status(500).json({ error: 'Không thể chấp nhận lời mời kết bạn' });
  }
}

async function removeFriendship(req, res) {
  try {
    if (!isValidObjectId(req.params.friendshipId)) {
      return res.status(400).json({ error: 'Lời mời kết bạn không hợp lệ' });
    }
    const friendship = await Friendship.findOneAndDelete({
      _id: req.params.friendshipId,
      $or: [{ userA: req.userId }, { userB: req.userId }],
    });
    if (!friendship) return res.status(404).json({ error: 'Không tìm thấy kết nối bạn bè' });
    if (friendship.status === 'pending') {
      await resolveNotification({
        userId: String(friendship.requestedBy) === String(req.userId)
          ? (String(friendship.userA) === String(req.userId) ? friendship.userB : friendship.userA)
          : req.userId,
        type: 'friend_request',
        friendshipId: friendship._id,
      }, String(friendship.requestedBy) === String(req.userId) ? 'cancelled' : 'declined');
    }
    const otherUserId = String(friendship.userA) === String(req.userId)
      ? friendship.userB
      : friendship.userA;
    emitToUser(otherUserId, 'friend:removed', { userId: String(req.userId) });
    res.json({ message: 'Đã cập nhật danh sách bạn bè' });
  } catch (error) {
    console.error('Lỗi xóa kết nối bạn bè:', error);
    res.status(500).json({ error: 'Không thể xóa kết nối bạn bè' });
  }
}

async function inviteFriendToGroup(req, res) {
  try {
    const { groupId, toUserId } = req.body;
    if (!isValidObjectId(groupId) || !isValidObjectId(toUserId)) {
      return res.status(400).json({ error: 'Nhóm hoặc người nhận không hợp lệ' });
    }
    if (String(req.userId) === String(toUserId)) {
      return res.status(400).json({ error: 'Bạn không thể tự mời mình vào nhóm' });
    }
    if (isRateLimited(inviteAttempts, String(req.userId), 10, 60 * 1000)) {
      return res.status(429).json({ error: 'Bạn gửi quá nhiều lời mời nhóm. Vui lòng thử lại sau.' });
    }

    const [friendship, group, recipient, sender] = await Promise.all([
      Friendship.findOne({
        status: 'accepted',
        $or: [
          { userA: req.userId, userB: toUserId },
          { userA: toUserId, userB: req.userId },
        ],
      }).select('_id'),
      Group.findById(groupId),
      User.findById(toUserId).select('name'),
      User.findById(req.userId).select('name'),
    ]);
    if (!friendship) return res.status(403).json({ error: 'Chỉ có thể mời bạn bè đã xác nhận' });
    if (!group) return res.status(404).json({ error: 'Không tìm thấy nhóm' });
    if (!group.members.some((member) => String(member.userId) === String(req.userId))) {
      return res.status(403).json({ error: 'Bạn cần là thành viên nhóm mới có thể mời người khác' });
    }
    if (!recipient || !sender) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
    if (group.members.some((member) => String(member.userId) === String(toUserId))) {
      return res.status(409).json({ error: 'Người này đã ở trong nhóm' });
    }
    const expiredInvites = await RoomInvite.find({
      groupId,
      fromUser: req.userId,
      toUser: toUserId,
      status: 'pending',
      expiresAt: { $lte: new Date() },
    }).select('_id toUser');
    if (expiredInvites.length > 0) {
      await RoomInvite.updateMany(
        { _id: { $in: expiredInvites.map((invite) => invite._id) }, status: 'pending' },
        { $set: { status: 'expired' } }
      );
      await Promise.all(expiredInvites.map((expiredInvite) => resolveNotification({
        userId: expiredInvite.toUser,
        type: 'room_invite',
        inviteId: expiredInvite._id,
      }, 'expired')));
    }
    const activeInvite = await RoomInvite.findOne({
      groupId,
      fromUser: req.userId,
      toUser: toUserId,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    }).select('_id');
    if (activeInvite) return res.status(409).json({ error: 'Lời mời vào nhóm đang chờ phản hồi' });

    const invite = await RoomInvite.create({
      groupId,
      fromUser: req.userId,
      toUser: toUserId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });
    await createNotification({
      userId: toUserId,
      actorId: req.userId,
      actorName: sender.name,
      type: 'room_invite',
      inviteId: invite._id,
      groupId: group._id,
      groupName: group.groupName,
    });
    const payload = {
      inviteId: String(invite._id),
      groupId: String(group._id),
      groupName: group.groupName,
      fromUserId: String(req.userId),
      fromUserName: sender.name,
      expiresAt: invite.expiresAt,
    };
    emitToUser(toUserId, 'room:invite', payload);
    res.status(201).json({ message: 'Đã gửi lời mời vào nhóm', invite: payload });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Lời mời vào nhóm đang chờ phản hồi' });
    }
    console.error('Lỗi mời bạn vào nhóm:', error);
    res.status(500).json({ error: 'Không thể gửi lời mời vào nhóm' });
  }
}

async function respondToRoomInvite(req, res) {
  try {
    const { decision } = req.body;
    if (!isValidObjectId(req.params.inviteId) || !['accepted', 'declined'].includes(decision)) {
      return res.status(400).json({ error: 'Phản hồi lời mời không hợp lệ' });
    }
    const existingInvite = await RoomInvite.findOne({
      _id: req.params.inviteId,
      toUser: req.userId,
    });
    if (!existingInvite) return res.status(404).json({ error: 'Không tìm thấy lời mời vào nhóm' });
    if (existingInvite.status !== 'pending') {
      return res.status(409).json({ error: 'Lời mời này đã được phản hồi hoặc hết hạn' });
    }
    if (existingInvite.expiresAt <= new Date()) {
      await RoomInvite.updateOne(
        { _id: existingInvite._id, status: 'pending' },
        { $set: { status: 'expired' } }
      );
      await resolveNotification({
        userId: req.userId,
        type: 'room_invite',
        inviteId: existingInvite._id,
      }, 'expired');
      await createNotification({
        userId: existingInvite.fromUser,
        actorName: 'Hệ thống',
        type: 'room_invite_expired',
        inviteId: existingInvite._id,
        groupId: existingInvite.groupId,
      });
      return res.status(410).json({ error: 'Lời mời vào nhóm đã hết hạn' });
    }

    const [group, user] = await Promise.all([
      Group.findById(existingInvite.groupId).select('groupName inviteCode members'),
      User.findById(req.userId).select('name'),
    ]);
    if (decision === 'accepted' && !group) {
      return res.status(404).json({ error: 'Nhóm không còn tồn tại' });
    }
    if (!user) return res.status(401).json({ error: 'Tài khoản không tồn tại' });

    const invite = await RoomInvite.findOneAndUpdate(
      {
        _id: existingInvite._id,
        toUser: req.userId,
        status: 'pending',
        expiresAt: { $gt: new Date() },
      },
      { $set: { status: decision } },
      { new: true }
    );
    if (!invite) return res.status(409).json({ error: 'Lời mời đã được phản hồi hoặc hết hạn' });

    if (decision === 'accepted') {
      try {
        const result = await Group.updateOne(
          { _id: group._id, 'members.userId': { $ne: req.userId } },
          { $push: { members: { userId: req.userId, name: user.name } } }
        );
        if (result.matchedCount === 0) {
          const currentGroup = await Group.findOne({
            _id: group._id,
            'members.userId': req.userId,
          }).select('_id');
          if (!currentGroup) {
            await RoomInvite.updateOne(
              { _id: invite._id, status: 'accepted' },
              { $set: { status: 'pending' } }
            );
            return res.status(404).json({ error: 'Nhóm không còn tồn tại' });
          }
        }
      } catch (error) {
        await RoomInvite.updateOne(
          { _id: invite._id, status: 'accepted' },
          { $set: { status: 'pending' } }
        );
        throw error;
      }
      await emitToGroupMembers(group._id, 'room:member_joined', {
        groupId: String(group._id),
        userId: String(req.userId),
        name: user.name,
      });
    }

    await resolveNotification({
      userId: req.userId,
      type: 'room_invite',
      inviteId: invite._id,
    }, decision);
    await createNotification({
      userId: invite.fromUser,
      actorId: req.userId,
      actorName: user.name,
      type: decision === 'accepted' ? 'room_invite_accepted' : 'room_invite_declined',
      inviteId: invite._id,
      groupId: invite.groupId,
      groupName: group?.groupName,
    });

    const response = { message: decision === 'accepted' ? 'Đã tham gia nhóm' : 'Đã từ chối lời mời' };
    if (decision === 'accepted') {
      response.group = {
        groupId: String(group._id),
        groupName: group.groupName,
        inviteCode: group.inviteCode,
      };
    }
    emitToUser(invite.fromUser, 'room:invite_updated', {
      inviteId: String(invite._id),
      status: decision,
      groupId: String(invite.groupId),
    });
    res.json(response);
  } catch (error) {
    console.error('Lỗi phản hồi lời mời vào nhóm:', error);
    res.status(500).json({ error: 'Không thể phản hồi lời mời vào nhóm' });
  }
}

module.exports = {
  listFriends,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriendship,
  inviteFriendToGroup,
  respondToRoomInvite,
};
