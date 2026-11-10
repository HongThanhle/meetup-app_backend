const mongoose = require('mongoose');

const pushTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  token: { type: String, required: true, unique: true },
  platform: { type: String, enum: ['ios', 'android'], required: true },
}, { timestamps: true });

module.exports = mongoose.model('PushToken', pushTokenSchema);
