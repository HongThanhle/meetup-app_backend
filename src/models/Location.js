const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    source: { type: String, enum: ['gps', 'manual'], required: true },
    rawAddress: { type: String, default: null }, // chỉ có giá trị nếu source = 'manual'
  },
  { timestamps: true }
);

// Mỗi user chỉ có 1 record vị trí trong 1 nhóm — gửi lại thì ghi đè (upsert), không tạo record mới
locationSchema.index({ groupId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Location', locationSchema);
