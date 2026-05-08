const fs = require('fs');
const net = require('net');
const path = require('path');
require('dotenv').config();

const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27017/LibreChat-e2e';
const DEFAULT_RUNTIME_ENV_PATH = path.resolve(__dirname, '../specs/.test-results/runtime-env.json');
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

function withDbName(uri, dbName) {
  const parsed = new URL(uri);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

function writeRuntimeEnv() {
  const runtimeEnvPath = process.env.E2E_RUNTIME_ENV_PATH || DEFAULT_RUNTIME_ENV_PATH;
  fs.mkdirSync(path.dirname(runtimeEnvPath), { recursive: true });
  fs.writeFileSync(runtimeEnvPath, JSON.stringify({ MONGO_URI: process.env.MONGO_URI }, null, 2));
}

async function maybeStartMemoryMongo() {
  const mongoUri = process.env.MONGO_URI ?? DEFAULT_MONGO_URI;
  const mode = process.env.E2E_USE_MEMORY_MONGO ?? 'auto';

  if (mode === 'false') {
    process.env.MONGO_URI = mongoUri;
    writeRuntimeEnv();
    return;
  }

  const { dbName, host, port } = parseMongoUri(mongoUri);
  if (mode === 'auto' && (!isLocalHost(host) || (await canConnect(host, port)))) {
    process.env.MONGO_URI = mongoUri;
    writeRuntimeEnv();
    return;
  }

  const { MongoMemoryServer } = require('mongodb-memory-server');
  mongoServer = await MongoMemoryServer.create({
    instance: {
      dbName,
      ip: '127.0.0.1',
    },
  });
  process.env.MONGO_URI = withDbName(mongoServer.getUri(), dbName);
  writeRuntimeEnv();
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
