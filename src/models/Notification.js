const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorName: { type: String, required: true },
    type: {
      type: String,
      enum: [
        'friend_request',
        'friend_accepted',
        'room_invite',
        'room_invite_accepted',
        'room_invite_declined',
        'room_invite_expired',
      ],
      required: true,
    },
    friendshipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Friendship' },
    inviteId: { type: mongoose.Schema.Types.ObjectId, ref: 'RoomInvite' },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
    groupName: { type: String },
    readAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    resolution: {
      type: String,
      enum: ['accepted', 'declined', 'cancelled', 'expired'],
      default: null,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
