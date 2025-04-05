const { AudioHandler } = require('./WebRTCHandler');
const { logger } = require('~/config');

class AudioSocketModule {
  constructor(socketIOService) {
    this.socketIOService = socketIOService;
    this.audioHandler = new AudioHandler();

    this.moduleId = 'audio-handler';
    this.registerHandlers();
  }

  registerHandlers() {
    this.socketIOService.registerModule(this.moduleId, {
      connection: (socket) => this.handleConnection(socket),
      disconnect: (socket) => this.handleDisconnect(socket),
    });
  }

  handleConnection(socket) {
    // Register WebRTC-specific event handlers for this socket
    this.audioHandler.registerSocketHandlers(socket, this.config);

    logger.debug(`Audio handler registered for client: ${socket.id}`);
  }

  handleDisconnect(socket) {
    // Cleanup audio resources for disconnected client
    this.audioHandler.cleanup(socket.id);
    logger.debug(`Audio handler cleaned up for client: ${socket.id}`);
  }

  // Used for app shutdown
  cleanup() {
    this.audioHandler.cleanupAll();
    this.socketIOService.unregisterModule(this.moduleId);
  }
}

module.exports = { AudioSocketModule };
