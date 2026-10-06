const Vote = require('../models/Vote');
const Group = require('../models/Group');

// Bình chọn / đổi vote
async function castVote(req, res) {
  try {
    const { groupId } = req.params;
    const { placeId, placeName, lat, lng } = req.body;
    const userId = req.userId;

    if (!placeId || !placeName || lat == null || lng == null) {
      return res.status(400).json({ error: 'Thiếu thông tin địa điểm để bình chọn' });
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Không tìm thấy nhóm' });
    if (group.finalizedPlace?.placeId) {
      return res.status(400).json({ error: 'Nhóm đã chốt điểm hẹn, không thể đổi vote' });
    }

    await Vote.findOneAndUpdate(
      { groupId, userId },
      { placeId, placeName, lat, lng },
      { upsert: true, new: true }
    );

    const result = await getTallyAndMaybeFinalize(groupId);
    res.json(result);
  } catch (err) {
    console.error('Lỗi khi bình chọn:', err);
    res.status(500).json({ error: 'Không thể lưu vote' });
  }
}

// Lấy kết quả vote hiện tại
async function getVoteResults(req, res) {
  try {
    const { groupId } = req.params;
    const result = await getTallyAndMaybeFinalize(groupId);
    res.json(result);
  } catch (err) {
    console.error('Lỗi khi lấy kết quả vote:', err);
    res.status(500).json({ error: 'Không thể lấy kết quả vote' });
  }
}

// Người tạo nhóm chốt tay (phòng trường hợp có người không vote)
async function finalizeManually(req, res) {
  try {
    const { groupId } = req.params;
    const { placeId, placeName, lat, lng, address } = req.body;
    const group = await Group.findById(groupId);

    if (!group) return res.status(404).json({ error: 'Không tìm thấy nhóm' });
    if (String(group.createdBy) !== String(req.userId)) {
      return res.status(403).json({ error: 'Chỉ người tạo nhóm mới có thể chốt điểm hẹn' });
    }

    group.finalizedPlace = { placeId, name: placeName, lat, lng, address };
    group.finalizedAt = new Date();
    await group.save();

    res.json({ finalizedPlace: group.finalizedPlace });
  } catch (err) {
    console.error('Lỗi khi chốt điểm hẹn:', err);
    res.status(500).json({ error: 'Không thể chốt điểm hẹn' });
  }
}

// ---- Hàm phụ: tính tally + tự động chốt nếu đủ điều kiện ----
async function getTallyAndMaybeFinalize(groupId) {
  const group = await Group.findById(groupId);
  const votes = await Vote.find({ groupId });

  const totalMembers = group.members.length;
  const totalVotes = votes.length;

  const tallyMap = {};
  votes.forEach((v) => {
    if (!tallyMap[v.placeId]) {
      tallyMap[v.placeId] = {
        placeId: v.placeId,
        placeName: v.placeName,
        lat: v.lat,
        lng: v.lng,
        count: 0,
        voterIds: [],
      };
    }
    tallyMap[v.placeId].count += 1;
    tallyMap[v.placeId].voterIds.push(String(v.userId));
  });

  const tally = Object.values(tallyMap).sort((a, b) => b.count - a.count);

  // Tự động chốt khi mọi người đã vote và chưa chốt trước đó
  if (!group.finalizedPlace?.placeId && totalMembers >= totalMembers && totalVotes >= totalMembers) {
    const winner = tally[0];
    if (winner) {
      group.finalizedPlace = {
        placeId: winner.placeId,
        name: winner.placeName,
        lat: winner.lat,
        lng: winner.lng,
      };
      group.finalizedAt = new Date();
      await group.save();
    }
  }

  return {
    totalMembers,
    totalVotes,
    tally,
    finalizedPlace: group.finalizedPlace?.placeId ? group.finalizedPlace : null,
  };
}

module.exports = { castVote, getVoteResults, finalizeManually };