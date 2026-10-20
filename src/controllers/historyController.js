const Group = require('../models/Group');
const MeetupHistory = require('../models/MeetupHistory');

async function listMyMeetupHistory(req, res) {
  try {
    const groups = await Group.find({
      'members.userId': req.userId,
      'finalizedPlace.placeId': { $exists: true, $ne: null },
    }).select('groupName createdBy members finalizedPlace finalizedAt createdAt updatedAt');

    if (groups.length > 0) {
      await MeetupHistory.bulkWrite(groups.map((group) => ({
        updateOne: {
          filter: { groupId: group._id },
          update: {
            $setOnInsert: {
              groupId: group._id,
              groupName: group.groupName,
              createdBy: group.createdBy,
              participants: group.members.map((member) => ({
                userId: member.userId,
                name: member.name,
              })),
              place: group.finalizedPlace,
              finalizedAt: group.finalizedAt || group.updatedAt || group.createdAt,
            },
          },
          upsert: true,
        },
      })));
    }

    const history = await MeetupHistory.find({ 'participants.userId': req.userId })
      .sort({ finalizedAt: -1 })
      .select('groupName participants place finalizedAt');

    res.json({
      history: history.map((meetup) => ({
        historyId: String(meetup._id),
        groupName: meetup.groupName,
        participants: meetup.participants.map((participant) => ({
          userId: String(participant.userId),
          name: participant.name,
        })),
        place: meetup.place,
        finalizedAt: meetup.finalizedAt,
      })),
    });
  } catch (error) {
    console.error('Lỗi lấy lịch sử cuộc hẹn:', error);
    res.status(500).json({ error: 'Không thể tải lịch sử cuộc hẹn' });
  }
}

module.exports = { listMyMeetupHistory };
