require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const Presence = require('./src/models/Presence');
const { initializeSocketServer } = require('./src/realtime/socketServer');

const PORT = process.env.PORT || 5000;

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
