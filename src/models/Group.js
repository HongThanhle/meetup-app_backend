const mongoose = require('mongoose');
const { DEFAULT_PLACE_CATEGORIES } = require('../services/placeCategories');

const groupSchema = new mongoose.Schema({
  groupName: { type: String, required: true },
  inviteCode: { type: String, required: true, unique: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      name: { type: String, required: true },
      joinedAt: { type: Date, default: Date.now },
    },
  ],
  placeCategories: {
    type: [String],
    default: () => [...DEFAULT_PLACE_CATEGORIES],
  },
  placeCategoriesLocked: { type: Boolean, default: false },
  // --- Thêm cho tính năng vote ---
  finalizedPlace: {
    placeId: String,
    name: String,
    lat: Number,
    lng: Number,
    address: String,
  },
  finalizedAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('Group', groupSchema);