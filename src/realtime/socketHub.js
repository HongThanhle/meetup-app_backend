let io;

function setSocketServer(socketServer) {
  io = socketServer;
}

function emitToUser(userId, event, payload) {
  if (!io) return;
  io.to(`user:${String(userId)}`).emit(event, payload);
}

function disconnectUser(userId) {
  if (!io) return;
  io.in(`user:${String(userId)}`).disconnectSockets(true);
}

module.exports = { setSocketServer, emitToUser, disconnectUser };
