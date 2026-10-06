const mongoose = require('mongoose');

const voteSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  placeId: { type: String, required: true },
  placeName: { type: String, required: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
}, { timestamps: true });

// Mỗi người chỉ có 1 vote đang hiệu lực trong 1 nhóm (vote mới thay vote cũ)
voteSchema.index({ groupId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Vote', voteSchema);