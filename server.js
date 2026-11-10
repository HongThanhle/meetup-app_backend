require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const Presence = require('./src/models/Presence');
const { initializeSocketServer } = require('./src/realtime/socketServer');

const PORT = process.env.PORT || 5000;

if (typeof process.env.JWT_SECRET !== 'string' || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET phải có ít nhất 32 ký tự trước khi khởi động máy chủ.');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGINS) {
  console.error('CORS_ORIGINS cần chứa domain website đã phát hành khi chạy production.');
  process.exit(1);
}

connectDB().then(() => {
  Presence.updateMany({ status: 'online' }, { $set: { status: 'offline' } })
    .then(() => {
      const server = http.createServer(app);
      initializeSocketServer(server);
      server.listen(PORT, () => {
        console.log(` Server đang chạy ở port ${PORT}`);
      });
    })
    .catch((error) => {
      console.error('Không thể khởi tạo presence:', error);
      process.exit(1);
    });
});
