const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema(
  {
    groupName: { type: String, required: true },
    inviteCode: { type: String, required: true, unique: true }, // mã mời ngắn, ví dụ "ABC123"
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: String, // lưu lại tên tại thời điểm join, tránh phải populate liên tục
        joinedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Group', groupSchema);
