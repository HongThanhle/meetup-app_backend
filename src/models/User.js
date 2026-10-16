const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true }, // đã hash bằng bcrypt, không lưu plain text
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
