const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true }, // đã hash bằng bcrypt, không lưu plain text
    emailVerified: { type: Boolean, default: true },
    emailVerificationCodeHash: { type: String, default: null },
    emailVerificationExpiresAt: { type: Date, default: null },
    emailVerificationSentAt: { type: Date, default: null },
    emailVerificationAttempts: { type: Number, default: 0 },
    emailVerificationWindowStartedAt: { type: Date, default: null },
    emailVerificationSendCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
