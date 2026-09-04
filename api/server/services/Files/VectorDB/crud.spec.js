const axios = require('axios');

jest.mock('axios');

jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('@librechat/api', () => {
  const actual = jest.requireActual('@librechat/api');
  return {
    logAxiosError: jest.fn(),
    generateShortLivedToken: jest.fn(() => 'mock-jwt-token'),
    resolveVectorId: actual.resolveVectorId,
  };
});

const { deleteVectors } = require('./crud');

const req = { user: { id: 'user-1' } };

describe('deleteVectors', () => {
  const ORIGINAL_RAG_API_URL = process.env.RAG_API_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RAG_API_URL = 'http://localhost:8000';
    axios.delete.mockResolvedValue({ status: 200 });
  });

  afterEach(() => {
    if (ORIGINAL_RAG_API_URL === undefined) {
      delete process.env.RAG_API_URL;
    } else {
      process.env.RAG_API_URL = ORIGINAL_RAG_API_URL;
    }
  });

  it('deletes the file under its own id', async () => {
    await deleteVectors(req, { file_id: 'file-1', embedded: true });

    expect(axios.delete).toHaveBeenCalledWith(
      'http://localhost:8000/documents',
      expect.objectContaining({ data: ['file-1'] }),
    );
  });

  it('deletes the vector document a borrowed file points at', async () => {
    await deleteVectors(req, { file_id: 'copy-1', vectorId: 'original-1', embedded: true });

    expect(axios.delete).toHaveBeenCalledWith(
      'http://localhost:8000/documents',
      expect.objectContaining({ data: ['original-1'] }),
    );
  });

  it('skips deletion once the caller has cleared embedded', async () => {
    await deleteVectors(req, { file_id: 'copy-1', vectorId: 'original-1', embedded: false });

    expect(axios.delete).not.toHaveBeenCalled();
  });

  it('skips deletion when no RAG API is configured', async () => {
    delete process.env.RAG_API_URL;

    await deleteVectors(req, { file_id: 'file-1', embedded: true });

    expect(axios.delete).not.toHaveBeenCalled();
  });
});
