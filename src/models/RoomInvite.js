const mongoose = require('mongoose');

const roomInviteSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    toUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['invite'], default: 'invite', required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'expired'],
      default: 'pending',
      required: true,
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

roomInviteSchema.index({ status: 1, expiresAt: 1 });
roomInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 604800 });
roomInviteSchema.index(
  { groupId: 1, fromUser: 1, toUser: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

module.exports = mongoose.model('RoomInvite', roomInviteSchema);
