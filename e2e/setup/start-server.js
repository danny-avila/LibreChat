const net = require('net');
const path = require('path');
require('dotenv').config();

const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27017/LibreChat-e2e';
let mongoServer;

function parseMongoUri(uri) {
  const parsed = new URL(uri);
  return {
    dbName: parsed.pathname.replace(/^\//, '') || 'LibreChat-e2e',
    host: parsed.hostname || '127.0.0.1',
    port: Number(parsed.port || 27017),
  };
}

function isLocalHost(host) {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

async function canConnect(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(500);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function maybeStartMemoryMongo() {
  const mongoUri = process.env.MONGO_URI ?? DEFAULT_MONGO_URI;
  const mode = process.env.E2E_USE_MEMORY_MONGO ?? 'auto';

  if (mode === 'false') {
    process.env.MONGO_URI = mongoUri;
    return;
  }

  const { dbName, host, port } = parseMongoUri(mongoUri);
  if (mode === 'auto' && (!isLocalHost(host) || (await canConnect(host, port)))) {
    process.env.MONGO_URI = mongoUri;
    return;
  }

  const { MongoMemoryServer } = require('mongodb-memory-server');
  mongoServer = await MongoMemoryServer.create({
    instance: {
      dbName,
      ip: host === 'localhost' ? '127.0.0.1' : host,
      port,
    },
  });
  process.env.MONGO_URI = mongoUri;
  console.log(`[e2e] Started memory MongoDB at ${process.env.MONGO_URI}`);
}

async function shutdown() {
  if (mongoServer) {
    await mongoServer.stop();
  }
}

process.once('SIGINT', async () => {
  await shutdown();
  process.exit(130);
});

process.once('SIGTERM', async () => {
  await shutdown();
  process.exit(143);
});

maybeStartMemoryMongo()
  .then(() => {
    require(path.resolve(__dirname, '../../api/server/index.js'));
  })
  .catch((error) => {
    console.error('[e2e] Failed to start test server:', error);
    process.exit(1);
  });
