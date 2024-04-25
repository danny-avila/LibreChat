const { getMessageById } = require('~/models');
const { Server } = require('socket.io');
const clients = [];

/**
 * Setup Websocket
 * @param {HTTP Server} server
 */
const setupWebSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: `${process.env.DOMAIN_CLIENT}`,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    // Handle incoming messages from the client
    const { userId, roomId } = socket.handshake.query;
    addConnection(socket, userId, roomId);

    // Handle client disconnection
    socket.on('disconnect', () => disconnectClient(socket));

    socket.on('new message', (data) => sendMessage(socket, data.message, data.roomId, data.bot));
    socket.on('udpate message', (data) => updateMessage(socket, data.message, data.roomId));

    socket.on('move room', (data) => moveRoom(socket.id, data.roomId));
  });
};

/**
 * @param {Socket} socket
 * @param {string} userId
 */
const addConnection = (socket, userId, roomId) => {
  let flag = 0;
  let userIndex = 0;
  clients.forEach((client, i) => {
    if (client.socket.id == socket.id) {
      flag = 1;
      userIndex = i;
    }
  });

  if (!flag) {
    clients.push({ socket, userId, roomId });
    console.log('=== Added new socket client ===', socket.id);
  } else if (userId && flag) {
    clients[userIndex].roomId = roomId;
    clients[userIndex].socket = socket;
  }
};

/**
 * @param {Socket} socket
 * @param {string} messageId
 * @param {string} roomId
 */
const sendMessage = async (socket, msg, roomId, isBot = false) => {
  console.log('--- new message ---', msg, roomId, isBot);
  try {
    let message = msg;
    if (!isBot) {
      message = await getMessageById(message.messageId);
    }

    if (message) {
      clients
        .filter((c) => c.roomId === roomId && socket.id !== c.socket.id)
        .forEach((client) => {
          if (Array.isArray(message)) {
            console.log('--- array message ---', message);
            message.forEach((m, i) => {
              client.socket.emit('new message', {
                roomId,
                message: m,
                replace: i === 0 ? true : false,
              });
            });
          } else {
            client.socket.emit('new message', {
              roomId,
              message,
            });
          }
        });
    }
  } catch (error) {
    throw new Error('[sendMessage] Error in Send Message');
  }
};

/**
 * @param {Socket} socket
 * @param {string} messageId
 * @param {string} roomId
 */
const updateMessage = async (socket, msg, roomId) => {
  try {
    const message = await getMessageById(msg.messageId);

    if (message) {
      clients
        .filter((c) => c.roomId === roomId && socket.id !== c.socket.id)
        .forEach((client) => {
          if (Array.isArray(message)) {
            console.log('--- array message ---', message);
            message.forEach((m, i) => {
              client.socket.emit('update message', {
                roomId,
                message: m,
                replace: i === 0 ? true : false,
              });
            });
          } else {
            client.socket.emit('update message', {
              roomId,
              message,
            });
          }
        });
    }
  } catch (error) {
    throw new Error('[sendMessage] Error in Send Message');
  }
};

const disconnectClient = (socket) => {
  const clientIndex = clients.map((c) => c.socket.id).indexOf(socket.id);
  if (clientIndex > -1) {
    console.log('=== Removed disconnected socket client ===', clients[clientIndex].socket.id);
    clients.splice(clientIndex, 1);
  }
};

const moveRoom = (socketId, roomId) => {
  try {
    const clientIndex = clients.map((c) => c.socket.id).indexOf(socketId);
    // const lastRoom = clients[clientIndex].roomId;
    clients[clientIndex].roomId = roomId;
    // const newRoom = clients[clientIndex].roomId;

    // clients.filter(client => client.roomId === lastRoom).forEach(client => client.socket.emit('user left the room', ))

    console.log(`=== User moved the room to ${clients[clientIndex].roomId} ===`);
  } catch (error) {
    throw new Error(`[moveRoom] Error in moverRoom ${error}`);
  }
};

module.exports = {
  setupWebSocket,
};
