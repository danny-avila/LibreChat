const { MongoMemoryServer } = require('mongodb-memory-server');
const { buildMongoConnectionOptions } = require('./connect');

describe('buildMongoConnectionOptions', () => {
  test('applies resilience defaults when no relevant env vars are set', () => {
    const options = buildMongoConnectionOptions({});

    expect(options).toEqual({
      bufferCommands: false,
      maxIdleTimeMS: 60000,
      heartbeatFrequencyMS: 10000,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 10000,
    });
  });

  test('respects explicit overrides for all four new tunables', () => {
    const options = buildMongoConnectionOptions({
      MONGO_MAX_IDLE_TIME_MS: '120000',
      MONGO_HEARTBEAT_FREQUENCY_MS: '5000',
      MONGO_SOCKET_TIMEOUT_MS: '30000',
      MONGO_SERVER_SELECTION_TIMEOUT_MS: '20000',
    });

    expect(options).toMatchObject({
      maxIdleTimeMS: 120000,
      heartbeatFrequencyMS: 5000,
      socketTimeoutMS: 30000,
      serverSelectionTimeoutMS: 20000,
    });
  });

  test('falls back to defaults for non-numeric values instead of NaN', () => {
    const options = buildMongoConnectionOptions({
      MONGO_MAX_IDLE_TIME_MS: 'not-a-number',
    });

    expect(options.maxIdleTimeMS).toBe(60000);
  });

  test('respects an explicit 0 rather than treating it as unset', () => {
    const options = buildMongoConnectionOptions({
      MONGO_SOCKET_TIMEOUT_MS: '0',
    });

    expect(options.socketTimeoutMS).toBe(0);
  });

  test('keeps existing pool tunables absent when unset (unchanged behavior)', () => {
    const options = buildMongoConnectionOptions({});

    expect(options).not.toHaveProperty('maxPoolSize');
    expect(options).not.toHaveProperty('minPoolSize');
    expect(options).not.toHaveProperty('maxConnecting');
    expect(options).not.toHaveProperty('waitQueueTimeoutMS');
    expect(options).not.toHaveProperty('autoIndex');
    expect(options).not.toHaveProperty('autoCreate');
  });

  test('still includes existing pool tunables when explicitly set (unchanged behavior)', () => {
    const options = buildMongoConnectionOptions({
      MONGO_MAX_POOL_SIZE: '10',
      MONGO_AUTO_INDEX: 'false',
    });

    expect(options.maxPoolSize).toBe(10);
    expect(options.autoIndex).toBe(false);
  });
});

describe('connectDb connection event listeners', () => {
  let mongoServer;
  let mongoose;
  let logger;
  let connectDb;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongoServer.getUri();

    jest.resetModules();

    jest.doMock('@librechat/data-schemas', () => ({
      logger: {
        warn: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
      },
    }));

    mongoose = require('mongoose');
    ({ logger } = require('@librechat/data-schemas'));
    ({ connectDb } = require('./connect'));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('connectDb establishes a real connection using the tuned options', async () => {
    const conn = await connectDb();
    expect(conn.readyState).toBe(1);
  });

  test('logs a warning when the connection emits "disconnected"', () => {
    mongoose.connection.emit('disconnected');
    expect(logger.warn).toHaveBeenCalledWith(
      '[connectDb] MongoDB connection lost (disconnected)',
    );
  });

  test('logs info when the connection emits "reconnected"', () => {
    mongoose.connection.emit('reconnected');
    expect(logger.info).toHaveBeenCalledWith(
      '[connectDb] MongoDB connection restored (reconnected)',
    );
  });

  test('logs info when the connection emits "close"', () => {
    mongoose.connection.emit('close');
    expect(logger.info).toHaveBeenCalledWith('[connectDb] MongoDB connection closed');
  });
});
