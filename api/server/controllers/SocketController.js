const { Server } = require('socket.io');
const clients = new Set();

/**
 * Setup Websocket
 * @param {HTTP Server} server
 */
const setupWebSocket = (server) => {
  const io = new Server(
    server,
    //   {
    //   cors: {
    //     origin: `${process.env.DOMAIN_SERVER}`,
    //     methods: ['GET', 'POST'],
    //     allowedHeaders: ['Content-Type', 'Authorization'],
    //     credentials: true,
    //   },
    // }
  );

  io.on('connection', (socket) => {
    // Handle incoming messages from the client
    addConnection(io, socket.handshake.query.userId);

    // Handle client disconnection
    socket.on('disconnect', () => {});

    socket.on('addMessage', () => {
      // addMessage(data);
    });
  });
};

const addConnection = (io, userId) => {
  console.log(userId);
  let flag = 0;
  clients.forEach((client) => {
    if (client.userId == userId) {
      flag = 1;
    }
  });
  if (!flag) {
    clients.add({ io, userId });
  }
};

// const addMessage = (data) {
//   try {

//   } catch (err) {

//   }
// }

module.exports = {
  setupWebSocket,
};
