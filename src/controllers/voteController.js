const Vote = require('../models/Vote');
const Group = require('../models/Group');
const MeetupHistory = require('../models/MeetupHistory');
const { isNonEmptyString, isValidCoordinate } = require('../middleware/validation');

// Bình chọn / đổi vote
async function castVote(req, res) {
  try {
    const { groupId } = req.params;
    const { placeId, placeName, lat, lng } = req.body;
    const userId = req.userId;

    if (
      !isNonEmptyString(placeId, 200)
      || !isNonEmptyString(placeName, 200)
      || !isValidCoordinate(lat, -90, 90)
      || !isValidCoordinate(lng, -180, 180)
    ) {
      return res.status(400).json({ error: 'Thiếu thông tin địa điểm để bình chọn' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Không tìm thấy nhóm' });
    }

    const lockedGroup = await Group.findOneAndUpdate(
      {
        _id: groupId,
        $or: [
          { 'finalizedPlace.placeId': { $exists: false } },
          { 'finalizedPlace.placeId': null },
        ],
      },
      { $set: { placeCategoriesLocked: true } },
      { new: true }
    );
    if (!lockedGroup) {
      return res.status(400).json({ error: 'Nhóm đã chốt điểm hẹn, không thể đổi vote' });
    }

    const currentVote = await Vote.findOne({ groupId, userId });
    if (currentVote?.placeId === placeId) {
      await Vote.deleteOne({ _id: currentVote._id });
    } else {
      await Vote.findOneAndUpdate(
        { groupId, userId },
        { placeId, placeName, lat, lng },
        { upsert: true, new: true }
      );
    }

    const result = await getVoteTally(lockedGroup, userId);
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
    const result = await getVoteTally(req.group, req.userId);
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
    if (
      !isNonEmptyString(placeId, 200)
      || !isNonEmptyString(placeName, 200)
      || !isValidCoordinate(lat, -90, 90)
      || !isValidCoordinate(lng, -180, 180)
      || (address != null && (typeof address !== 'string' || address.length > 500))
    ) {
      return res.status(400).json({ error: 'Thông tin điểm hẹn không hợp lệ' });
    }
    if (group.finalizedPlace?.placeId && group.finalizedPlace.placeId !== placeId) {
      return res.status(409).json({ error: 'Nhóm đã chốt điểm hẹn' });
    }

    const finalizedPlace = {
      placeId,
      name: placeName.trim(),
      lat,
      lng,
      address: address?.trim() || undefined,
    };
    const finalizedAt = group.finalizedAt || new Date();
    const finalizedGroup = await Group.findOneAndUpdate(
      {
        _id: groupId,
        createdBy: req.userId,
        $or: [
          { 'finalizedPlace.placeId': { $exists: false } },
          { 'finalizedPlace.placeId': null },
        ],
      },
      {
        $set: {
          finalizedPlace,
          finalizedAt,
          placeCategoriesLocked: true,
        },
      },
      { new: true }
    );

    if (!finalizedGroup && !group.finalizedPlace?.placeId) {
      return res.status(409).json({ error: 'Nhóm vừa được chốt bởi một thành viên khác' });
    }

    const savedGroup = finalizedGroup || group;
    const savedPlace = savedGroup.finalizedPlace;
    const savedAt = savedGroup.finalizedAt || finalizedAt;

    await MeetupHistory.updateOne(
      { groupId: savedGroup._id },
      {
        $setOnInsert: {
          groupId: savedGroup._id,
          groupName: savedGroup.groupName,
          createdBy: savedGroup.createdBy,
          participants: savedGroup.members.map((member) => ({
            userId: member.userId,
            name: member.name,
          })),
          place: savedPlace,
          finalizedAt: savedAt,
        },
      },
      { upsert: true }
    );

    res.json({ finalizedPlace: savedPlace, finalizedAt: savedAt });
  } catch (err) {
    console.error('Lỗi khi chốt điểm hẹn:', err);
    res.status(500).json({ error: 'Không thể chốt điểm hẹn' });
  }
}

// ---- Hàm phụ: tính kết quả vote; việc chốt điểm hẹn do trưởng nhóm quyết định ----
async function getVoteTally(group, viewerId) {
  const votes = await Vote.find({ groupId: group._id });
  const memberNames = new Map(
    group.members.map((member) => [String(member.userId), member.name])
  );

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
        voterNames: [],
      };
    }
    tallyMap[v.placeId].count += 1;
    tallyMap[v.placeId].voterIds.push(String(v.userId));
    const voterName = memberNames.get(String(v.userId));
    if (voterName) {
      tallyMap[v.placeId].voterNames.push(voterName);
    }
  });

  const tally = Object.values(tallyMap).sort((a, b) => b.count - a.count);

  return {
    totalMembers,
    totalVotes,
    tally,
    finalizedPlace: group.finalizedPlace?.placeId ? group.finalizedPlace : null,
    canFinalize: String(group.createdBy) === String(viewerId),
    placeCategoriesLocked: Boolean(group.placeCategoriesLocked || votes.length > 0 || group.finalizedPlace?.placeId),
  };
}

module.exports = { castVote, getVoteResults, finalizeManually };