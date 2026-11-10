const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Group = require('../models/Group');
const Location = require('../models/Location');
const Vote = require('../models/Vote');
const Friendship = require('../models/Friendship');
const RoomInvite = require('../models/RoomInvite');
const Presence = require('../models/Presence');
const Notification = require('../models/Notification');
const MeetupHistory = require('../models/MeetupHistory');
const { emitToGroupMembers } = require('../realtime/socketServer');
const { disconnectUser } = require('../realtime/socketHub');
const PushToken = require('../models/PushToken');

async function deleteAccountData(userId) {
  const session = await mongoose.startSession();
  const survivingGroupIds = [];
  const deletedGroupIds = [];

  try {
    await session.withTransaction(async () => {
      const userExists = await User.exists({ _id: userId }).session(session);
      if (!userExists) {
        const error = new Error('Tài khoản không tồn tại');
        error.status = 404;
        throw error;
      }

      const groups = await Group.find({ 'members.userId': userId }).session(session);
      for (const group of groups) {
        const remainingMembers = group.members
          .filter((member) => String(member.userId) !== String(userId))
          .sort((first, second) => new Date(first.joinedAt || 0) - new Date(second.joinedAt || 0));

        if (remainingMembers.length === 0) {
          deletedGroupIds.push(group._id);
          await Group.deleteOne({ _id: group._id }, { session });
          await Location.deleteMany({ groupId: group._id }, { session });
          await Vote.deleteMany({ groupId: group._id }, { session });
          continue;
        }

        const nextLeaderId = String(group.createdBy) === String(userId)
          ? remainingMembers[0].userId
          : group.createdBy;
        await Group.updateOne(
          { _id: group._id },
          {
            $pull: { members: { userId } },
            $set: { createdBy: nextLeaderId },
            $unset: { suggestionCache: 1 },
          },
          { session }
        );
        await Location.deleteOne({ groupId: group._id, userId }, { session });
        await Vote.deleteOne({ groupId: group._id, userId }, { session });
        survivingGroupIds.push(group._id);
      }

      const histories = await MeetupHistory.find({ 'participants.userId': userId }).session(session);
      for (const history of histories) {
        const participants = history.participants.filter(
          (participant) => String(participant.userId) !== String(userId)
        );
        if (participants.length === 0) {
          await MeetupHistory.deleteOne({ _id: history._id }, { session });
          continue;
        }
        const update = { $set: { participants } };
        if (String(history.createdBy) === String(userId)) {
          update.$set.createdBy = participants[0].userId;
        }
        await MeetupHistory.updateOne({ _id: history._id }, update, { session });
      }

      const inviteFilter = {
        $or: [
          { fromUser: userId },
          { toUser: userId },
          ...(deletedGroupIds.length ? [{ groupId: { $in: deletedGroupIds } }] : []),
        ],
      };
      const invites = await RoomInvite.find(inviteFilter).select('_id').session(session);
      const inviteIds = invites.map((invite) => invite._id);

      await Friendship.deleteMany({ $or: [{ userA: userId }, { userB: userId }] }, { session });
      await RoomInvite.deleteMany(inviteFilter, { session });
      await Notification.deleteMany({
          $or: [
            { userId },
            { actorId: userId },
            ...(inviteIds.length ? [{ inviteId: { $in: inviteIds } }] : []),
            ...(deletedGroupIds.length ? [{ groupId: { $in: deletedGroupIds } }] : []),
          ],
        }, { session });
      await Presence.deleteOne({ userId }, { session });
      await PushToken.deleteMany({ userId }, { session });
      await User.deleteOne({ _id: userId }, { session });
    });

    disconnectUser(userId);
    await Promise.all(survivingGroupIds.map((groupId) => (
      emitToGroupMembers(groupId, 'group:updated', { groupId: String(groupId), reason: 'member_deleted' })
    )));
    return { message: 'Tài khoản và dữ liệu cá nhân đã được xóa' };
  } catch (error) {
    throw error;
  } finally {
    await session.endSession();
  }
}

async function verifyPassword(user, password) {
  return typeof password === 'string'
    && password.length > 0
    && await bcrypt.compare(password, user.password);
}

async function deleteMyAccount(req, res, next) {
  try {
    const user = await User.findById(req.userId).select('+password');
    if (!user) return res.status(404).json({ error: 'Tài khoản không tồn tại' });
    if (!(await verifyPassword(user, req.body.password))) {
      return res.status(403).json({ error: 'Mật khẩu xác nhận không chính xác' });
    }
    const result = await deleteAccountData(user._id);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function requestAccountDeletion(req, res, next) {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body.password;
    if (!email || email.length > 254 || typeof password !== 'string' || password.length > 128) {
      return res.status(400).json({ error: 'Vui lòng nhập email và mật khẩu hợp lệ' });
    }
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await verifyPassword(user, password))) {
      return res.status(403).json({ error: 'Email hoặc mật khẩu không chính xác' });
    }
    const result = await deleteAccountData(user._id);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = { deleteMyAccount, requestAccountDeletion };
