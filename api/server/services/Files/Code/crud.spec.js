const http = require('http');
const https = require('https');
const { Readable } = require('stream');

const mockAxios = jest.fn();
mockAxios.post = jest.fn();

jest.mock('@librechat/agents', () => ({
  getCodeBaseURL: jest.fn(() => 'https://code-api.example.com'),
}));

jest.mock('@librechat/api', () => {
  const http = require('http');
  const https = require('https');
  return {
    logAxiosError: jest.fn(({ message }) => message),
    createAxiosInstance: jest.fn(() => mockAxios),
    codeServerHttpAgent: new http.Agent({ keepAlive: false }),
    codeServerHttpsAgent: new https.Agent({ keepAlive: false }),
  };
});

const { codeServerHttpAgent, codeServerHttpsAgent } = require('@librechat/api');
const { getCodeOutputDownloadStream, uploadCodeEnvFile } = require('./crud');

describe('Code CRUD', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCodeOutputDownloadStream', () => {
    it('should pass dedicated keepAlive:false agents to axios', async () => {
      const mockResponse = { data: Readable.from(['chunk']) };
      mockAxios.mockResolvedValue(mockResponse);

      await getCodeOutputDownloadStream('session-1/file-1', 'test-key');

      const callConfig = mockAxios.mock.calls[0][0];
      expect(callConfig.httpAgent).toBe(codeServerHttpAgent);
      expect(callConfig.httpsAgent).toBe(codeServerHttpsAgent);
      expect(callConfig.httpAgent).toBeInstanceOf(http.Agent);
      expect(callConfig.httpsAgent).toBeInstanceOf(https.Agent);
      expect(callConfig.httpAgent.keepAlive).toBe(false);
      expect(callConfig.httpsAgent.keepAlive).toBe(false);
    });

    it('should request stream response from the correct URL', async () => {
      mockAxios.mockResolvedValue({ data: Readable.from(['chunk']) });

      await getCodeOutputDownloadStream('session-1/file-1', 'test-key');

      const callConfig = mockAxios.mock.calls[0][0];
      expect(callConfig.url).toBe('https://code-api.example.com/download/session-1/file-1');
      expect(callConfig.responseType).toBe('stream');
      expect(callConfig.timeout).toBe(15000);
      expect(callConfig.headers['X-API-Key']).toBe('test-key');
    });

    it('should throw on network error', async () => {
      mockAxios.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(getCodeOutputDownloadStream('s/f', 'key')).rejects.toThrow();
    });
  });

  describe('uploadCodeEnvFile', () => {
    const baseUploadParams = {
      req: { user: { id: 'user-123' } },
      stream: Readable.from(['file-content']),
      filename: 'data.csv',
      apiKey: 'test-key',
    };

    it('should pass dedicated keepAlive:false agents to axios', async () => {
      mockAxios.post.mockResolvedValue({
        data: {
          message: 'success',
          session_id: 'sess-1',
          files: [{ fileId: 'fid-1', filename: 'data.csv' }],
        },
      });

      await uploadCodeEnvFile(baseUploadParams);

      const callConfig = mockAxios.post.mock.calls[0][2];
      expect(callConfig.httpAgent).toBe(codeServerHttpAgent);
      expect(callConfig.httpsAgent).toBe(codeServerHttpsAgent);
      expect(callConfig.httpAgent).toBeInstanceOf(http.Agent);
      expect(callConfig.httpsAgent).toBeInstanceOf(https.Agent);
      expect(callConfig.httpAgent.keepAlive).toBe(false);
      expect(callConfig.httpsAgent.keepAlive).toBe(false);
    });

    it('should set a timeout on upload requests', async () => {
      mockAxios.post.mockResolvedValue({
        data: {
          message: 'success',
          session_id: 'sess-1',
          files: [{ fileId: 'fid-1', filename: 'data.csv' }],
        },
      });

      await uploadCodeEnvFile(baseUploadParams);

      const callConfig = mockAxios.post.mock.calls[0][2];
      expect(callConfig.timeout).toBe(120000);
    });

    it('should return fileIdentifier on success', async () => {
      mockAxios.post.mockResolvedValue({
        data: {
          message: 'success',
          session_id: 'sess-1',
          files: [{ fileId: 'fid-1', filename: 'data.csv' }],
        },
      });

      const result = await uploadCodeEnvFile(baseUploadParams);
      expect(result).toBe('sess-1/fid-1');
    });

    it('should append entity_id query param when provided', async () => {
      mockAxios.post.mockResolvedValue({
        data: {
          message: 'success',
          session_id: 'sess-1',
          files: [{ fileId: 'fid-1', filename: 'data.csv' }],
        },
      });

      const result = await uploadCodeEnvFile({ ...baseUploadParams, entity_id: 'agent-42' });
      expect(result).toBe('sess-1/fid-1?entity_id=agent-42');
    });

    it('should throw when server returns non-success message', async () => {
      mockAxios.post.mockResolvedValue({
        data: { message: 'quota_exceeded', session_id: 's', files: [] },
      });

      await expect(uploadCodeEnvFile(baseUploadParams)).rejects.toThrow('quota_exceeded');
    });

    it('should throw on network error', async () => {
      mockAxios.post.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(uploadCodeEnvFile(baseUploadParams)).rejects.toThrow();
    });
  });
});
