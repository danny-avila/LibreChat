const axios = require('axios');

jest.mock('axios');

jest.mock('@librechat/api', () => ({
  RagScopes: { embed: 'rag:embed', rerank: 'rag:rerank' },
  isEnabled: jest.fn(() => false),
  logAxiosError: jest.fn(),
  generateShortLivedToken: jest.fn(() => 'mock-jwt-token'),
}));

const createContextHandlers = require('./createContextHandlers');
const { isEnabled, generateShortLivedToken } = require('@librechat/api');

describe('createContextHandlers', () => {
  const ORIGINAL_RAG_API_URL = process.env.RAG_API_URL;

  const req = { user: { id: 'user-1', tenantId: 'tenant-a' } };

  const embeddedFile = (file_id, extra = {}) => ({
    file_id,
    filename: `${file_id}.pdf`,
    type: 'application/pdf',
    embedded: true,
    ...extra,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    isEnabled.mockReturnValue(false);
    generateShortLivedToken.mockReturnValue('mock-jwt-token');
    axios.post.mockResolvedValue({ data: [] });
    axios.get.mockResolvedValue({ data: '' });
    process.env.RAG_API_URL = 'http://rag-api.test';
  });

  afterEach(() => {
    if (ORIGINAL_RAG_API_URL === undefined) {
      delete process.env.RAG_API_URL;
    } else {
      process.env.RAG_API_URL = ORIGINAL_RAG_API_URL;
    }
  });

  describe('semantic search', () => {
    it('names the owning agent on the query and in the token', async () => {
      const handlers = createContextHandlers(req, 'what does it say?');
      await handlers.processFile(embeddedFile('kb-1', { entity_id: 'agent_123' }));
      await handlers.createContext();

      const [, body] = axios.post.mock.calls[0];
      expect(body).toMatchObject({ file_id: 'kb-1', entity_id: 'agent_123' });
      expect(generateShortLivedToken).toHaveBeenCalledWith({
        userId: 'user-1',
        tenantId: 'tenant-a',
        entityIds: ['agent_123'],
        scopes: ['rag:embed'],
      });
    });

    it('keeps a message attachment scoped to the user alone', async () => {
      const handlers = createContextHandlers(req, 'what does it say?');
      await handlers.processFile(embeddedFile('attachment-1'));
      await handlers.createContext();

      const [, body] = axios.post.mock.calls[0];
      expect(body).not.toHaveProperty('entity_id');
      expect(generateShortLivedToken).toHaveBeenCalledWith({
        userId: 'user-1',
        tenantId: 'tenant-a',
        entityIds: [],
        scopes: ['rag:embed'],
      });
    });
  });

  describe('full-context reads', () => {
    beforeEach(() => {
      isEnabled.mockReturnValue(true);
    });

    it('names the owning agent on the document context request', async () => {
      const handlers = createContextHandlers(req, 'what does it say?');
      await handlers.processFile(embeddedFile('kb-1', { entity_id: 'agent_123' }));
      await handlers.createContext();

      const [url, config] = axios.get.mock.calls[0];
      expect(url).toBe('http://rag-api.test/documents/kb-1/context');
      expect(config.params).toEqual({ entity_id: 'agent_123' });
      expect(generateShortLivedToken).toHaveBeenCalledWith({
        userId: 'user-1',
        tenantId: 'tenant-a',
        entityIds: ['agent_123'],
        scopes: ['rag:embed'],
      });
    });

    it('sends no entity for a file with no agent context', async () => {
      const handlers = createContextHandlers(req, 'what does it say?');
      await handlers.processFile(embeddedFile('attachment-1'));
      await handlers.createContext();

      const [, config] = axios.get.mock.calls[0];
      expect(config.params).toBeUndefined();
    });
  });

  it('returns nothing when the RAG API is not configured', () => {
    delete process.env.RAG_API_URL;
    expect(createContextHandlers(req, 'query')).toBeUndefined();
  });
});
