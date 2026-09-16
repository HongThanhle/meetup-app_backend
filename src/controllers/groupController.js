const Group = require('../models/Group');
const Location = require('../models/Location');
const User = require('../models/User');

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
    if (!groupName) {
      return res.status(400).json({ error: 'Thiếu tên nhóm' });
    }

    const user = await User.findById(req.userId);

    // Đảm bảo mã mời không trùng — thử lại nếu trùng (hiếm khi xảy ra)
    let inviteCode;
    let isUnique = false;
    while (!isUnique) {
      inviteCode = generateInviteCode();
      const existing = await Group.findOne({ inviteCode });
      if (!existing) isUnique = true;
    }

    const group = await Group.create({
      groupName,
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
    res.status(500).json({ error: 'Lỗi server khi tạo nhóm' });
  }
}

async function joinGroup(req, res) {
  try {
    const { inviteCode } = req.body;
    if (!inviteCode) {
      return res.status(400).json({ error: 'Thiếu mã mời' });
    }

    const group = await Group.findOne({ inviteCode: inviteCode.toUpperCase() });
    if (!group) {
      return res.status(404).json({ error: 'Mã mời không đúng hoặc không tồn tại' });
    }

    const alreadyMember = group.members.some((m) => m.userId.toString() === req.userId);
    if (!alreadyMember) {
      const user = await User.findById(req.userId);
      group.members.push({ userId: req.userId, name: user.name });
      await group.save();
    }

    res.json({ groupId: group._id, groupName: group.groupName });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server khi tham gia nhóm' });
  }
}

async function getGroupStatus(req, res) {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Không tìm thấy nhóm' });
    }

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
    res.status(500).json({ error: 'Lỗi server khi lấy trạng thái nhóm' });
  }
}

module.exports = { createGroup, joinGroup, getGroupStatus };
