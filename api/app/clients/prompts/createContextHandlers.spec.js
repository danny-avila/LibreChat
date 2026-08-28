const axios = require('axios');

jest.mock('axios');

jest.mock('@librechat/api', () => {
  const actual = jest.requireActual('@librechat/api');
  return {
    isEnabled: jest.fn(() => false),
    logAxiosError: jest.fn(),
    generateShortLivedToken: jest.fn(() => 'mock-jwt-token'),
    resolveVectorId: actual.resolveVectorId,
  };
});

const { isEnabled } = require('@librechat/api');
const createContextHandlers = require('./createContextHandlers');

const req = { user: { id: 'user-1' } };

const queryBodies = () =>
  axios.post.mock.calls.filter(([url]) => String(url).endsWith('/query')).map(([, body]) => body);

describe('createContextHandlers', () => {
  const ORIGINAL_RAG_API_URL = process.env.RAG_API_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    isEnabled.mockReturnValue(false);
    process.env.RAG_API_URL = 'http://localhost:8000';
    axios.post.mockResolvedValue({ data: [] });
    axios.get.mockResolvedValue({ data: '' });
  });

  afterEach(() => {
    if (ORIGINAL_RAG_API_URL === undefined) {
      delete process.env.RAG_API_URL;
    } else {
      process.env.RAG_API_URL = ORIGINAL_RAG_API_URL;
    }
  });

  it('returns nothing when no RAG API is configured', () => {
    delete process.env.RAG_API_URL;
    expect(createContextHandlers(req, 'question')).toBeUndefined();
  });

  it('queries a file under its own id', async () => {
    const handlers = createContextHandlers(req, 'question');
    await handlers.processFile({ file_id: 'file-1', filename: 'a.pdf', embedded: true });

    expect(queryBodies()).toEqual([{ file_id: 'file-1', query: 'question', k: 4 }]);
  });

  it('queries the vector document a borrowed file points at', async () => {
    const handlers = createContextHandlers(req, 'question');
    await handlers.processFile({
      file_id: 'copy-1',
      vectorId: 'original-1',
      filename: 'a.pdf',
      embedded: true,
    });

    expect(queryBodies().map((body) => body.file_id)).toEqual(['original-1']);
  });

  it('queries a shared vector document only once', async () => {
    const handlers = createContextHandlers(req, 'question');
    await handlers.processFile({ file_id: 'original-1', filename: 'a.pdf', embedded: true });
    await handlers.processFile({
      file_id: 'copy-1',
      vectorId: 'original-1',
      filename: 'a-copy.pdf',
      embedded: true,
    });

    expect(queryBodies()).toHaveLength(1);
  });

  it('still queries distinct documents separately', async () => {
    const handlers = createContextHandlers(req, 'question');
    await handlers.processFile({ file_id: 'file-1', filename: 'a.pdf', embedded: true });
    await handlers.processFile({ file_id: 'file-2', filename: 'b.pdf', embedded: true });

    expect(queryBodies().map((body) => body.file_id)).toEqual(['file-1', 'file-2']);
  });

  it('skips files that were never embedded', async () => {
    const handlers = createContextHandlers(req, 'question');
    await handlers.processFile({ file_id: 'file-1', filename: 'a.pdf' });

    expect(axios.post).not.toHaveBeenCalled();
  });

  it('fetches full context under the resolved vector id', async () => {
    isEnabled.mockReturnValue(true);
    const handlers = createContextHandlers(req, 'question');
    await handlers.processFile({
      file_id: 'copy-1',
      vectorId: 'original-1',
      filename: 'a.pdf',
      embedded: true,
    });

    expect(axios.get).toHaveBeenCalledWith(
      'http://localhost:8000/documents/original-1/context',
      expect.anything(),
    );
  });
});
