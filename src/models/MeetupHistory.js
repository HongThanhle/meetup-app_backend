const mongoose = require('mongoose');

const meetupHistorySchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    groupName: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    participants: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        name: { type: String, required: true },
      },
    ],
    place: {
      placeId: { type: String, required: true },
      name: { type: String, required: true },
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
      address: { type: String },
    },
    finalizedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

meetupHistorySchema.index({ groupId: 1 }, { unique: true });
meetupHistorySchema.index({ 'participants.userId': 1, finalizedAt: -1 });

module.exports = mongoose.model('MeetupHistory', meetupHistorySchema);
