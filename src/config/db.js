const mongoose = require('mongoose');
const Group = require('../models/Group');

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    await Group.collection.createIndex(
      { createdBy: 1, creationRequestId: 1 },
      {
        unique: true,
        partialFilterExpression: { creationRequestId: { $type: 'string' } },
      }
    );
    console.log('Đã kết nối MongoDB');
  } catch (err) {
    console.error(' Lỗi kết nối MongoDB:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
