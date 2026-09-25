const Group = require('../models/Group');
const Location = require('../models/Location');
const User = require('../models/User');
const { isNonEmptyString } = require('../middleware/validation');

// Sinh mã mời ngẫu nhiên 6 ký tự, chỉ chữ hoa + số, tránh ký tự dễ nhầm (0/O, 1/I)
function generateInviteCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
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
      const user = await User.findById(req.userId);
      if (!user) {
        return res.status(401).json({ error: 'Tài khoản không tồn tại' });
      }
      group.members.push({ userId: req.userId, name: user.name });
      await group.save();
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
    const locations = await Location.find({ groupId }).select('userId');
    const submittedIds = new Set(locations.map((l) => l.userId.toString()));

    const members = group.members.map((m) => ({
      userId: m.userId.toString(),
      name: m.name,
      hasSubmitted: submittedIds.has(m.userId.toString()),
    }));

    res.json({ groupName: group.groupName, members });
  } catch (err) {
    console.error('Lỗi lấy trạng thái nhóm:', err);
    res.status(500).json({ error: 'Lỗi server khi lấy trạng thái nhóm' });
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
    group.members = group.members.filter((m) => m.userId.toString() !== req.userId);
    await group.save();
    await Location.deleteOne({ groupId, userId: req.userId });
    res.json({ message: 'Đã rời nhóm' });
  } catch (err) {
    console.error('Lỗi rời nhóm:', err);
    res.status(500).json({ error: 'Lỗi server khi rời nhóm' });
  }
}

module.exports = { createGroup, joinGroup, getGroupStatus, getMyGroups, leaveGroup };

