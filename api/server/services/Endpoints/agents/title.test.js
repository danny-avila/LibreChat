const mockCache = { get: jest.fn(), set: jest.fn(), delete: jest.fn() };
const mockSaveConvo = jest.fn();

jest.mock('@librechat/api', () => ({
  isEnabled: (val) => val === true || val === 'true',
  sanitizeTitle: (title) => title,
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('librechat-data-provider', () => ({
  CacheKeys: { GEN_TITLE: 'GEN_TITLE' },
}));

jest.mock('~/cache/getLogStores', () => jest.fn(() => mockCache));

jest.mock('~/models', () => ({
  saveConvo: (...args) => mockSaveConvo(...args),
}));

const addTitle = require('./title');

const flush = () => new Promise((resolve) => setImmediate(resolve));

const makeClient = (title = 'Generated Title') => ({
  options: { titleConvo: true },
  titleConvo: jest.fn().mockResolvedValue(title),
});

const makeReq = () => ({ user: { id: 'user-1' }, body: {}, config: {} });

describe('agents addTitle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the explicit conversationId for the cache key and saveConvo (immediate mode)', async () => {
    const client = makeClient('My Title');

    await addTitle(makeReq(), {
      text: 'hello',
      client,
      conversationId: 'cid-immediate',
      immediate: true,
      convoReady: Promise.resolve(),
    });

    expect(mockCache.set).toHaveBeenCalledWith(
      'user-1-cid-immediate',
      'My Title',
      expect.any(Number),
    );
    expect(mockSaveConvo).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ conversationId: 'cid-immediate', title: 'My Title' }),
      expect.objectContaining({ noUpsert: true }),
    );
  });

  it('passes immediate:true through to client.titleConvo', async () => {
    const client = makeClient();

    await addTitle(makeReq(), {
      text: 'hello',
      client,
      conversationId: 'cid',
      immediate: true,
      convoReady: Promise.resolve(),
    });

    expect(client.titleConvo).toHaveBeenCalledWith(expect.objectContaining({ immediate: true }));
  });

  it('falls back to response.conversationId in legacy (final) mode', async () => {
    const client = makeClient('Legacy Title');

    await addTitle(makeReq(), {
      text: 'hi',
      client,
      response: { conversationId: 'resp-cid' },
    });

    expect(mockCache.set).toHaveBeenCalledWith(
      'user-1-resp-cid',
      'Legacy Title',
      expect.any(Number),
    );
    expect(mockSaveConvo).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ conversationId: 'resp-cid', title: 'Legacy Title' }),
      expect.objectContaining({ noUpsert: true }),
    );
    expect(client.titleConvo).toHaveBeenCalledWith(expect.objectContaining({ immediate: false }));
  });

  it('caches the title immediately but defers saveConvo until convoReady resolves', async () => {
    const client = makeClient('Deferred Title');
    let resolveConvo;
    const convoReady = new Promise((resolve) => {
      resolveConvo = resolve;
    });

    const pending = addTitle(makeReq(), {
      text: 'hello',
      client,
      conversationId: 'cid-defer',
      immediate: true,
      convoReady,
    });

    await flush();

    // Title is cached for the live UI, but persistence waits for the row to exist.
    expect(mockCache.set).toHaveBeenCalledWith(
      'user-1-cid-defer',
      'Deferred Title',
      expect.any(Number),
    );
    expect(mockSaveConvo).not.toHaveBeenCalled();

    resolveConvo();
    await pending;

    expect(mockSaveConvo).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ conversationId: 'cid-defer', title: 'Deferred Title' }),
      expect.objectContaining({ noUpsert: true }),
    );
  });

  it('skips generation when the endpoint disables titleConvo', async () => {
    const client = makeClient();
    client.options.titleConvo = false;

    await addTitle(makeReq(), { text: 'hi', client, conversationId: 'cid', immediate: true });

    expect(client.titleConvo).not.toHaveBeenCalled();
    expect(mockSaveConvo).not.toHaveBeenCalled();
  });

  it('skips generation for temporary conversations', async () => {
    const client = makeClient();
    const req = makeReq();
    req.body.isTemporary = true;

    await addTitle(req, { text: 'hi', client, conversationId: 'cid', immediate: true });

    expect(client.titleConvo).not.toHaveBeenCalled();
    expect(mockSaveConvo).not.toHaveBeenCalled();
  });

  it('skips generation when neither conversationId nor response is provided', async () => {
    const client = makeClient();

    await addTitle(makeReq(), { text: 'hi', client });

    expect(client.titleConvo).not.toHaveBeenCalled();
    expect(mockCache.set).not.toHaveBeenCalled();
    expect(mockSaveConvo).not.toHaveBeenCalled();
  });
});
