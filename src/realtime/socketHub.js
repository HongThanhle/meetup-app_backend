let io;

function setSocketServer(socketServer) {
  io = socketServer;
}

function emitToUser(userId, event, payload) {
  if (!io) return;
  io.to(`user:${String(userId)}`).emit(event, payload);
}

module.exports = { setSocketServer, emitToUser };
