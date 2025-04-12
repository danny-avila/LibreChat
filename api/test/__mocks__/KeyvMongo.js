jest.mock('@keyv/mongo', () => {
  const EventEmitter = require('events');
  class KeyvMongo extends EventEmitter {
    constructor(url = 'mongodb://127.0.0.1:27017', options) {
      super();
      this.ttlSupport = false;
      url = url ?? {};
      if (typeof url === 'string') {
        url = { url };
      }
      if (url.uri) {
        url = { url: url.uri, ...url };
      }
      this.opts = {
        url,
        collection: 'keyv',
        ...url,
        ...options,
      };

      // In-memory store for tests
      this.store = new Map();
    }

    async get(key) {
      return this.store.get(key);
    }

    async set(key, value, ttl) {
      this.store.set(key, value);
      return true;
    }

    async delete(key) {
      return this.store.delete(key);
    }

    async clear() {
      this.store.clear();
      return true;
    }
  }

  // Create a store factory function for the test suite
  const store = () => new KeyvMongo();

  return { KeyvMongo };
});
