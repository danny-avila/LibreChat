const mockGet = jest.fn();
const mockSet = jest.fn();

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
    }

    get = mockGet;
    set = mockSet;
  }

  return KeyvMongo;
});
