const { randomInt } = require('crypto');
const Group = require('../models/Group');
const Location = require('../models/Location');
const User = require('../models/User');
const Vote = require('../models/Vote');
const { isNonEmptyString } = require('../middleware/validation');
const {
  DEFAULT_PLACE_CATEGORIES,
  PLACE_CATEGORIES,
  PLACE_CATEGORY_IDS,
} = require('../services/placeCategories');
const { MAX_GROUP_MEMBERS } = require('../config/groupLimits');
const { emitToGroupMembers } = require('../realtime/socketServer');

// Sinh mã mời ngẫu nhiên 6 ký tự, chỉ chữ hoa + số, tránh ký tự dễ nhầm (0/O, 1/I)
function generateInviteCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(randomInt(chars.length));
  }
  return code;
}

async function createGroup(req, res) {
  try {
    const { groupName } = req.body;
    if (!isNonEmptyString(groupName, 100)) {
      return res.status(400).json({ error: 'Tên nhóm không hợp lệ' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(401).json({ error: 'Tài khoản không tồn tại' });
    }

    // Đảm bảo mã mời không trùng — thử lại nếu trùng (hiếm khi xảy ra)
    let inviteCode;
    let isUnique = false;
    while (!isUnique) {
      inviteCode = generateInviteCode();
      const existing = await Group.findOne({ inviteCode });
      if (!existing) isUnique = true;
    }

    const group = await Group.create({
      groupName: groupName.trim(),
      inviteCode,
      createdBy: req.userId,
      members: [{ userId: req.userId, name: user.name }],
    });

    res.status(201).json({
      groupId: group._id,
      groupName: group.groupName,
      inviteCode: group.inviteCode,
    });
  } catch (err) {
    console.error('Lỗi tạo nhóm:', err);
    res.status(500).json({ error: 'Lỗi server khi tạo nhóm' });
  }
}

async function joinGroup(req, res) {
  try {
    const { inviteCode } = req.body;
    if (!isNonEmptyString(inviteCode, 6)) {
      return res.status(400).json({ error: 'Mã mời không hợp lệ' });
    }

    const normalizedInviteCode = inviteCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(normalizedInviteCode)) {
      return res.status(400).json({ error: 'Mã mời không hợp lệ' });
    }

    const group = await Group.findOne({ inviteCode: normalizedInviteCode });
    if (!group) {
      return res.status(404).json({ error: 'Mã mời không đúng hoặc không tồn tại' });
    }

    const alreadyMember = group.members.some((m) => m.userId && m.userId.toString() === req.userId);
    if (!alreadyMember) {
      if (group.members.length >= MAX_GROUP_MEMBERS) {
        return res.status(409).json({ error: `Nhóm đã đầy (${MAX_GROUP_MEMBERS} thành viên tối đa)` });
      }
      const user = await User.findById(req.userId);
      if (!user) {
        return res.status(401).json({ error: 'Tài khoản không tồn tại' });
      }
      const joinedGroup = await Group.findOneAndUpdate(
        {
          _id: group._id,
          'members.userId': { $ne: req.userId },
          $expr: { $lt: [{ $size: '$members' }, MAX_GROUP_MEMBERS] },
        },
        { $push: { members: { userId: req.userId, name: user.name } }, $unset: { suggestionCache: 1 } },
        { new: true }
      );
      if (!joinedGroup) {
        const currentGroup = await Group.findById(group._id).select('members');
        if (!currentGroup?.members.some((member) => String(member.userId) === String(req.userId))) {
          return res.status(409).json({ error: `Nhóm đã đầy (${MAX_GROUP_MEMBERS} thành viên tối đa)` });
        }
      }
      await emitToGroupMembers(group._id, 'group:updated', { groupId: String(group._id), reason: 'member_joined' });
    }

    res.json({ groupId: group._id, groupName: group.groupName });
  } catch (err) {
    console.error('Lỗi tham gia nhóm:', err);
    res.status(500).json({ error: 'Lỗi server khi tham gia nhóm' });
  }
}

async function getGroupStatus(req, res) {
  try {
    const { groupId } = req.params;
    const group = req.group;

    // Lấy danh sách userId đã gửi vị trí trong nhóm này
    const [locations, voteCount] = await Promise.all([
      Location.find({ groupId }).select('userId'),
      Vote.countDocuments({ groupId }),
    ]);
    const submittedIds = new Set(locations.map((l) => l.userId.toString()));

    const members = group.members.map((m) => ({
      userId: m.userId.toString(),
      name: m.name,
      isLeader: m.userId.toString() === group.createdBy.toString(),
      hasSubmitted: submittedIds.has(m.userId.toString()),
    }));

    res.json({
      groupName: group.groupName,
      members,
      voteCount,
      finalizedPlace: group.finalizedPlace?.placeId ? group.finalizedPlace : null,
    });
  } catch (err) {
    console.error('Lỗi lấy trạng thái nhóm:', err);
    res.status(500).json({ error: 'Lỗi server khi lấy trạng thái nhóm' });
  }
}

async function updatePlaceCategories(req, res) {
  try {
    const { groupId } = req.params;
    const { categories } = req.body;
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: 'Không tìm thấy nhóm' });
    }
    if (String(group.createdBy) !== String(req.userId)) {
      return res.status(403).json({ error: 'Chỉ trưởng nhóm mới có thể chọn loại địa điểm' });
    }
    if (
      !Array.isArray(categories)
      || categories.length === 0
      || categories.length > PLACE_CATEGORIES.length
      || categories.some((category) => typeof category !== 'string' || !PLACE_CATEGORY_IDS.has(category))
      || new Set(categories).size !== categories.length
    ) {
      return res.status(400).json({ error: 'Danh sách loại địa điểm không hợp lệ' });
    }
    if (group.finalizedPlace?.placeId) {
      return res.status(409).json({ error: 'Nhóm đã chốt điểm hẹn, không thể đổi loại địa điểm' });
    }

    const hasVotes = await Vote.exists({ groupId });
    if (hasVotes) {
      await Group.updateOne({ _id: groupId }, { $set: { placeCategoriesLocked: true } });
      return res.status(409).json({ error: 'Đã có bình chọn, không thể đổi loại địa điểm' });
    }

    const updatedGroup = await Group.findOneAndUpdate(
      {
        _id: groupId,
        createdBy: req.userId,
        placeCategoriesLocked: { $ne: true },
        'finalizedPlace.placeId': { $exists: false },
      },
      { $set: { placeCategories: categories }, $unset: { suggestionCache: 1 } },
      { new: true }
    );

    if (!updatedGroup) {
      return res.status(409).json({ error: 'Đã có bình chọn hoặc nhóm đã chốt, không thể đổi loại địa điểm' });
    }

    await emitToGroupMembers(groupId, 'group:updated', { groupId: String(groupId), reason: 'categories' });

    res.json({
      placeCategories: updatedGroup.placeCategories,
      placeCategoriesLocked: false,
    });
  } catch (err) {
    console.error('Lỗi cập nhật loại địa điểm:', err);
    res.status(500).json({ error: 'Không thể cập nhật loại địa điểm' });
  }
}

async function getMyGroups(req, res) {
  try {
    const groups = await Group.find({ 'members.userId': req.userId }).sort({ createdAt: -1 });
    const result = groups.map((g) => ({
      groupId: g._id,
      groupName: g.groupName,
      inviteCode: g.inviteCode,
      memberCount: g.members.length,
    }));
    res.json({ groups: result });
  } catch (err) {
    console.error('Lỗi lấy danh sách nhóm:', err);
    res.status(500).json({ error: 'Lỗi server khi lấy danh sách nhóm' });
  }
}

async function leaveGroup(req, res) {
  try {
    const { groupId } = req.params;
    const group = req.group;
    const remainingMembers = group.members.filter((m) => m.userId.toString() !== req.userId);
    const isLeader = group.createdBy.toString() === req.userId;

    if (remainingMembers.length === 0) {
      await emitToGroupMembers(groupId, 'group:updated', { groupId: String(groupId), reason: 'member_left' });
      await Location.deleteMany({ groupId });
      await Vote.deleteMany({ groupId });
      await group.deleteOne();
      return res.json({ message: 'Nhóm đã được xóa vì thành viên cuối cùng đã rời', groupDeleted: true });
    }

    let newLeader = null;
    if (isLeader) {
      newLeader = [...remainingMembers].sort(
        (first, second) => new Date(first.joinedAt || 0) - new Date(second.joinedAt || 0)
      )[0];
      group.createdBy = newLeader.userId;
    }

    group.members = remainingMembers;
    group.set('suggestionCache', undefined);
    await group.save();
    await Location.deleteOne({ groupId, userId: req.userId });
    await Vote.deleteOne({ groupId, userId: req.userId });
    await emitToGroupMembers(groupId, 'group:updated', { groupId: String(groupId), reason: 'member_left' });

    res.json({
      message: isLeader
        ? `Đã chuyển quyền trưởng nhóm cho ${newLeader.name}`
        : 'Đã rời nhóm',
      newLeader: newLeader?.name,
    });
  } catch (err) {
    console.error('Lỗi rời nhóm:', err);
    res.status(500).json({ error: 'Lỗi server khi rời nhóm' });
  }
}

module.exports = {
  createGroup,
  joinGroup,
  getGroupStatus,
  updatePlaceCategories,
  getMyGroups,
  leaveGroup,
};
