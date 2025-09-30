import { FileSources } from 'librechat-data-provider';
import { Readable } from 'stream';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  createReadStream: jest.fn(),
}));

jest.mock('../crypto/jwt', () => ({
  generateShortLivedToken: jest.fn(),
}));

jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
  interceptors: {
    request: { use: jest.fn(), eject: jest.fn() },
    response: { use: jest.fn(), eject: jest.fn() },
  },
}));

jest.mock('form-data', () => {
  return jest.fn().mockImplementation(() => ({
    append: jest.fn(),
    getHeaders: jest.fn().mockReturnValue({ 'content-type': 'multipart/form-data' }),
  }));
});

// Mock the utils module to avoid AWS SDK issues
jest.mock('../utils', () => ({
  logAxiosError: jest.fn((args) => {
    if (typeof args === 'object' && args.message) {
      return args.message;
    }
    return 'Error';
  }),
  readFileAsString: jest.fn(),
}));

// Now import everything after mocks are in place
import { parseTextNative, parseText } from './text';
import fs, { ReadStream } from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import { generateShortLivedToken } from '../crypto/jwt';
import { readFileAsString } from '../utils';

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedFormData = FormData as jest.MockedClass<typeof FormData>;
const mockedGenerateShortLivedToken = generateShortLivedToken as jest.MockedFunction<
  typeof generateShortLivedToken
>;
const mockedReadFileAsString = readFileAsString as jest.MockedFunction<typeof readFileAsString>;

describe('text', () => {
  const mockFile: Express.Multer.File = {
    fieldname: 'file',
    originalname: 'test.txt',
    encoding: '7bit',
    mimetype: 'text/plain',
    size: 100,
    destination: '/tmp',
    filename: 'test.txt',
    path: '/tmp/test.txt',
    buffer: Buffer.from('test content'),
    stream: new Readable(),
  };

  const mockReq = {
    user: { id: 'user123' },
  };

  const mockFileId = 'file123';

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.RAG_API_URL;
  });

  describe('parseTextNative', () => {
    it('should successfully parse a text file', async () => {
      const mockText = 'Hello, world!';
      const mockBytes = Buffer.byteLength(mockText, 'utf8');

      mockedReadFileAsString.mockResolvedValue({
        content: mockText,
        bytes: mockBytes,
      });

      const result = await parseTextNative(mockFile);

      expect(mockedReadFileAsString).toHaveBeenCalledWith('/tmp/test.txt', {
        fileSize: 100,
      });
      expect(result).toEqual({
        text: mockText,
        bytes: mockBytes,
        source: FileSources.text,
      });
    });

    it('should handle file read errors', async () => {
      const mockError = new Error('File not found');
      mockedReadFileAsString.mockRejectedValue(mockError);

      await expect(parseTextNative(mockFile)).rejects.toThrow('File not found');
    });
  });

  describe('parseText', () => {
    beforeEach(() => {
      mockedGenerateShortLivedToken.mockReturnValue('mock-jwt-token');

      const mockFormDataInstance = {
        append: jest.fn(),
        getHeaders: jest.fn().mockReturnValue({ 'content-type': 'multipart/form-data' }),
      };
      mockedFormData.mockImplementation(() => mockFormDataInstance as unknown as FormData);

      mockedFs.createReadStream.mockReturnValue({} as unknown as ReadStream);
    });

    it('should fall back to native parsing when RAG_API_URL is not defined', async () => {
      const mockText = 'Native parsing result';
      const mockBytes = Buffer.byteLength(mockText, 'utf8');

      mockedReadFileAsString.mockResolvedValue({
        content: mockText,
        bytes: mockBytes,
      });

      const result = await parseText({
        req: mockReq,
        file: mockFile,
        file_id: mockFileId,
      });

      expect(result).toEqual({
        text: mockText,
        bytes: mockBytes,
        source: FileSources.text,
      });
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should fall back to native parsing when health check fails', async () => {
      process.env.RAG_API_URL = 'http://rag-api.test';
      const mockText = 'Native parsing result';
      const mockBytes = Buffer.byteLength(mockText, 'utf8');

      mockedReadFileAsString.mockResolvedValue({
        content: mockText,
        bytes: mockBytes,
      });

      mockedAxios.get.mockRejectedValue(new Error('Health check failed'));

      const result = await parseText({
        req: mockReq,
        file: mockFile,
        file_id: mockFileId,
      });

      expect(mockedAxios.get).toHaveBeenCalledWith('http://rag-api.test/health', {
        timeout: 10000,
      });
      expect(result).toEqual({
        text: mockText,
        bytes: mockBytes,
        source: FileSources.text,
      });
    });

    it('should fall back to native parsing when health check returns non-OK status', async () => {
      process.env.RAG_API_URL = 'http://rag-api.test';
      const mockText = 'Native parsing result';
      const mockBytes = Buffer.byteLength(mockText, 'utf8');

      mockedReadFileAsString.mockResolvedValue({
        content: mockText,
        bytes: mockBytes,
      });

      mockedAxios.get.mockResolvedValue({
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await parseText({
        req: mockReq,
        file: mockFile,
        file_id: mockFileId,
      });

      expect(result).toEqual({
        text: mockText,
        bytes: mockBytes,
        source: FileSources.text,
      });
    });

    it('should accept empty text as valid RAG API response', async () => {
      process.env.RAG_API_URL = 'http://rag-api.test';

      mockedAxios.get.mockResolvedValue({
        status: 200,
        statusText: 'OK',
      });

      mockedAxios.post.mockResolvedValue({
        data: {
          text: '',
        },
      });

      const result = await parseText({
        req: mockReq,
        file: mockFile,
        file_id: mockFileId,
      });

      expect(result).toEqual({
        text: '',
        bytes: 0,
        source: FileSources.text,
      });
    });

    it('should fall back to native parsing when RAG API response lacks text property', async () => {
      process.env.RAG_API_URL = 'http://rag-api.test';
      const mockText = 'Native parsing result';
      const mockBytes = Buffer.byteLength(mockText, 'utf8');

      mockedReadFileAsString.mockResolvedValue({
        content: mockText,
        bytes: mockBytes,
      });

      mockedAxios.get.mockResolvedValue({
        status: 200,
        statusText: 'OK',
      });

      mockedAxios.post.mockResolvedValue({
        data: {},
      });

      const result = await parseText({
        req: mockReq,
        file: mockFile,
        file_id: mockFileId,
      });

      expect(result).toEqual({
        text: mockText,
        bytes: mockBytes,
        source: FileSources.text,
      });
    });

    it('should fall back to native parsing when user is undefined', async () => {
      process.env.RAG_API_URL = 'http://rag-api.test';
      const mockText = 'Native parsing result';
      const mockBytes = Buffer.byteLength(mockText, 'utf8');

      mockedReadFileAsString.mockResolvedValue({
        content: mockText,
        bytes: mockBytes,
      });

      const result = await parseText({
        req: { user: undefined },
        file: mockFile,
        file_id: mockFileId,
      });

      expect(mockedGenerateShortLivedToken).not.toHaveBeenCalled();
      expect(mockedAxios.get).not.toHaveBeenCalled();
      expect(mockedAxios.post).not.toHaveBeenCalled();
      expect(result).toEqual({
        text: mockText,
        bytes: mockBytes,
        source: FileSources.text,
      });
    });
  });
});
