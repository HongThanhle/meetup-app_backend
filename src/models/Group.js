const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema(
  {
    groupName: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
    inviteCode: { type: String, required: true, unique: true, uppercase: true, match: /^[A-Z0-9]{6}$/ }, // mã mời ngắn, ví dụ "ABC123"
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        name: { type: String, required: true, trim: true, maxlength: 80 }, // lưu lại tên tại thời điểm join, tránh phải populate liên tục
        joinedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Group', groupSchema);
