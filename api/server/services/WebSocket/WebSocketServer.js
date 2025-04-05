const { Server } = require('socket.io');
const { logger } = require('~/config');

class SocketIOService {
  constructor(httpServer) {
    this.io = new Server(httpServer, {
      path: '/socket.io',
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.connections = new Map();
    this.eventHandlers = new Map();
    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      this.log(`Client connected: ${socket.id}`);
      this.connections.set(socket.id, socket);

      // Emit connection event for modules to handle
      this.emitEvent('connection', socket);

      socket.on('disconnect', () => {
        this.log(`Client disconnected: ${socket.id}`);
        this.emitEvent('disconnect', socket);
        this.connections.delete(socket.id);
      });
    });
  }

  // Register a module to handle specific events
  registerModule(moduleId, eventHandlers) {
    for (const [eventName, handler] of Object.entries(eventHandlers)) {
      if (!this.eventHandlers.has(eventName)) {
        this.eventHandlers.set(eventName, new Map());
      }

      this.eventHandlers.get(eventName).set(moduleId, handler);

      // If this is a socket event, register it on all existing connections
      if (eventName !== 'connection' && eventName !== 'disconnect') {
        for (const socket of this.connections.values()) {
          socket.on(eventName, (...args) => {
            handler(socket, ...args);
          });
        }
      }
    }
  }

  // Unregister a module
  unregisterModule(moduleId) {
    for (const handlers of this.eventHandlers.values()) {
      handlers.delete(moduleId);
    }
  }

  // Emit an event to all registered handlers
  emitEvent(eventName, ...args) {
    const handlers = this.eventHandlers.get(eventName);
    if (handlers) {
      for (const handler of handlers.values()) {
        handler(...args);
      }
    }
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();

    try {
      logger.debug(`[WebSocket] ${message}`, level);
    } catch (error) {
      console.log(`[WebSocket ${timestamp}] [${level.toUpperCase()}] ${message}`);
      console.error(`[WebSocket ${timestamp}] [ERROR] Error while logging: ${error.message}`);
    }
  }

  shutdown() {
    this.connections.clear();
    this.eventHandlers.clear();
    this.io.close();
  }
}

module.exports = { SocketIOService };
