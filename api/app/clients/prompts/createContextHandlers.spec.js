const axios = require('axios');

jest.mock('axios');
jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn(),
  generateShortLivedToken: jest.fn(),
  logAxiosError: jest.fn(),
}));

const { isEnabled, generateShortLivedToken } = require('@librechat/api');
const createContextHandlers = require('./createContextHandlers');

describe('createContextHandlers', () => {
  const originalEnv = process.env;
  const req = { user: { id: 'user-1' } };
  const file = { file_id: 'file-1', filename: 'notes.pdf', type: 'application/pdf', embedded: true };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, RAG_API_URL: 'http://localhost:8000' };
    generateShortLivedToken.mockReturnValue('mock-jwt-token');
    isEnabled.mockReturnValue(false);
    axios.post.mockResolvedValue({ data: [] });
    axios.get.mockResolvedValue({ data: 'full document text' });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('does not call rag_api /query when the user message is empty', async () => {
    const handlers = createContextHandlers(req, '');
    await handlers.processFile(file);
    const context = await handlers.createContext();

    expect(axios.post).not.toHaveBeenCalled();
    expect(axios.get).not.toHaveBeenCalled();
    expect(context).toBe('');
  });

  it('does not call rag_api /query when the user message is whitespace', async () => {
    const handlers = createContextHandlers(req, '   \n\t  ');
    await handlers.processFile(file);
    const context = await handlers.createContext();

    expect(axios.post).not.toHaveBeenCalled();
    expect(context).toBe('');
  });

  it('queries rag_api when the user message has content', async () => {
    axios.post.mockResolvedValue({
      data: [[{ page_content: 'hit', metadata: { source: 'notes.pdf' } }, 0.1]],
    });

    const handlers = createContextHandlers(req, 'find the deadline');
    await handlers.processFile(file);
    const context = await handlers.createContext();

    expect(axios.post).toHaveBeenCalledWith(
      'http://localhost:8000/query',
      { file_id: 'file-1', query: 'find the deadline', k: 4 },
      {
        headers: {
          Authorization: 'Bearer mock-jwt-token',
          'Content-Type': 'application/json',
        },
      },
    );
    expect(context).toContain('notes.pdf');
    expect(context).toContain('hit');
  });

  it('still loads full document context when RAG_USE_FULL_CONTEXT is enabled', async () => {
    isEnabled.mockReturnValue(true);

    const handlers = createContextHandlers(req, '');
    await handlers.processFile(file);
    const context = await handlers.createContext();

    expect(axios.post).not.toHaveBeenCalled();
    expect(axios.get).toHaveBeenCalledWith('http://localhost:8000/documents/file-1/context', {
      headers: { Authorization: 'Bearer mock-jwt-token' },
    });
    expect(context).toContain('full document text');
  });
});
