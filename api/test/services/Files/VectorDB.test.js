const axios = require('axios');
const fs = require('fs');

jest.mock('axios');
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  createReadStream: jest.fn(),
}));

const mockAppend = jest.fn();
const mockGetHeaders = jest.fn();

jest.mock('form-data', () => {
  return jest.fn().mockImplementation(() => ({
    append: (...args) => mockAppend(...args),
    getHeaders: () => mockGetHeaders(),
  }));
});

const mockLogAxiosError = jest.fn();
const mockGenerateShortLivedToken = jest.fn().mockReturnValue('jwt-token');

jest.mock('@librechat/api', () => ({
  logAxiosError: mockLogAxiosError,
  generateShortLivedToken: mockGenerateShortLivedToken,
}));

const { uploadVectors } = require('~/server/services/Files/VectorDB/crud');

describe('uploadVectors', () => {
  const mockReq = { user: { id: 'user-123' } };
  const mockFile = {
    path: '/tmp/embedding.pdf',
    size: 2048,
    originalname: 'embedding.pdf',
  };

  beforeAll(() => {
    process.env.RAG_API_URL = 'http://rag_api:8000';
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAppend.mockClear();
    mockGetHeaders.mockReturnValue({ 'content-type': 'multipart/form-data' });
    fs.createReadStream.mockReturnValue('stream');
    axios.post.mockResolvedValue({ data: { known_type: true, status: true } });
  });

  it('attaches storage metadata, parsed text, and parsed chunks before sending to RAG API', async () => {
    const result = await uploadVectors({
      req: mockReq,
      file: mockFile,
      file_id: 'file-123',
      parsedText: 'hello world',
      parsedTextChunks: ['hello', 'world'],
      storageMetadata: { filename: 'embedding.pdf' },
    });

    expect(mockGenerateShortLivedToken).toHaveBeenCalledWith('user-123');
    expect(mockAppend).toHaveBeenCalledWith('file_id', 'file-123');
    expect(mockAppend).toHaveBeenCalledWith('file', 'stream');
    expect(mockAppend).toHaveBeenCalledWith('storage_metadata', JSON.stringify({ filename: 'embedding.pdf' }));
    expect(mockAppend).toHaveBeenCalledWith('parsed_text', JSON.stringify('hello world'));
    expect(mockAppend).toHaveBeenCalledWith('parsed_text_chunks', JSON.stringify(['hello', 'world']));

    expect(axios.post).toHaveBeenCalledWith(
      'http://rag_api:8000/embed',
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer jwt-token',
        }),
      }),
    );

    expect(result).toEqual({
      bytes: 2048,
      filename: 'embedding.pdf',
      filepath: 'vectordb',
      embedded: true,
    });
  });

  it('throws when the RAG API says the file type is unknown', async () => {
    axios.post.mockResolvedValue({ data: { known_type: false, status: true } });

    await expect(
      uploadVectors({ req: mockReq, file: mockFile, file_id: 'file-123' }),
    ).rejects.toThrow('File embedding failed. The filetype');

    expect(mockLogAxiosError).toHaveBeenCalled();
  });

  it('throws when the RAG API reports a missing status', async () => {
    axios.post.mockResolvedValue({ data: { known_type: true, status: false } });

    await expect(
      uploadVectors({ req: mockReq, file: mockFile, file_id: 'file-123' }),
    ).rejects.toThrow('File embedding failed.');

    expect(mockLogAxiosError).toHaveBeenCalled();
  });
});
