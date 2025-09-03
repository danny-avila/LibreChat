const EventEmitter = require('events');

class QueryLogger extends EventEmitter {
  constructor() {
    super();
    this.clients = [];
  }

  addClient(client) {
    this.clients.push(client);
    client.on('close', () => this.removeClient(client));
  }

  removeClient(client) {
    this.clients = this.clients.filter((c) => c !== client);
  }

  sendToClients(data) {
    this.clients.forEach((client) => {
      client.write(`data: ${JSON.stringify(data)}

`);
    });
  }
}

const queryLogger = new QueryLogger();
module.exports = queryLogger;