const mongoose = require('mongoose');
const Group = require('../models/Group');

async function requireGroupMember(req, res, next) {
  const { groupId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return res.status(400).json({ error: 'groupId không hợp lệ' });
  }

  try {
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Không tìm thấy nhóm' });
    }

    const isMember = group.members.some(
      (member) => member.userId && member.userId.toString() === req.userId
    );

    if (!isMember) {
      return res.status(403).json({ error: 'Bạn không thuộc nhóm này' });
    }

    req.group = group;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requireGroupMember;