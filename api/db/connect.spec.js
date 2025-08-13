jest.mock('dotenv');
require('dotenv').config();
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Helper to clear the connect module from require cache
function clearConnectModule() {
  delete require.cache[require.resolve('./connect')];
}

beforeEach(() => {
  // Reset environment and global state
  clearConnectModule();
  delete process.env.MONGO_URI;
  delete process.env.MONGO_DB_NAME;
  global.mongoose = undefined;
});

describe('connectDb Module', () => {
  it('throws if MONGO_URI is not defined', () => {
    expect(() => require('./connect')).toThrow('Please define the MONGO_URI environment variable');
  });

  describe('with in-memory MongoDB', () => {
    let mongoServer;
    let uri;

    beforeAll(async () => {
      mongoServer = await MongoMemoryServer.create();
      uri = mongoServer.getUri();
    });

    afterAll(async () => {
      // Ensure real mongoose connection is torn down
      await mongoose.disconnect();
      await mongoServer.stop();
    });

    it('connects using only MONGO_URI (no dbName override)', async () => {
      process.env.MONGO_URI = uri;
      clearConnectModule();
      const { connectDb } = require('./connect');

      const mongooseInstance = await connectDb();
      expect(mongooseInstance).toBe(mongoose);

      // The default DB is whatever follows the last slash in the URI
      const defaultDbNameMatch = uri.match(/\/([\w-]+)(\?.*)?$/);
      const defaultDbName = defaultDbNameMatch ? defaultDbNameMatch[1] : mongoose.connection.name;
      expect(mongooseInstance.connection.name).toBe(defaultDbName);
    });

    it('strips any DB name in URI when MONGO_DB_NAME is set', async () => {
      process.env.MONGO_URI = uri;
      process.env.MONGO_DB_NAME = 'ignoredDbName';
      clearConnectModule();

      const connectSpy = jest.spyOn(mongoose, 'connect');
      const { connectDb } = require('./connect');
      await connectDb();

      const [calledUri, calledOpts] = connectSpy.mock.calls[0];
      // Should have removed the trailing "/<dbname>"
      expect(calledUri).not.toMatch(/\/[\w-]+$/);
      // And since we strip it rather than passing dbName, opts.dbName remains unset
      expect(calledOpts).not.toHaveProperty('dbName');

      connectSpy.mockRestore();
    });

    it('caches the connection between calls', async () => {
      process.env.MONGO_URI = uri;
      clearConnectModule();
      const { connectDb } = require('./connect');

      const first = await connectDb();
      // simulate still-connected
      mongoose.connection.readyState = 1;
      const second = await connectDb();

      expect(second).toBe(first);
    });

    it('reconnects if cached conn is disconnected', async () => {
      process.env.MONGO_URI = uri;
      clearConnectModule();
      const { connectDb } = require('./connect');

      // First, establish a connection
      await connectDb();
      expect(mongoose.connection.readyState).toBe(1);

      // Now actually tear it down
      await mongoose.disconnect();
      expect(mongoose.connection.readyState).toBe(0);

      // Calling again should reconnect
      await connectDb();
      expect(mongoose.connection.readyState).toBe(1);
    });
  });
});
