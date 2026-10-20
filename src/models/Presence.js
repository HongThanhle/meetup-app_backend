const mongoose = require('mongoose');

const presenceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    status: { type: String, enum: ['online', 'offline'], default: 'offline', required: true },
    lastSeenAt: { type: Date, default: Date.now, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Presence', presenceSchema);
