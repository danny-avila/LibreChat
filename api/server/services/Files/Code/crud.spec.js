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
    appendCodeEnvFile: jest.fn((form, stream, filename) => {
      form.append('file', stream, { filename });
    }),
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

      await getCodeOutputDownloadStream('session-1/file-1');

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

      await getCodeOutputDownloadStream('session-1/file-1');

      const callConfig = mockAxios.mock.calls[0][0];
      expect(callConfig.url).toBe('https://code-api.example.com/download/session-1/file-1');
      expect(callConfig.responseType).toBe('stream');
      expect(callConfig.timeout).toBe(15000);
    });

    it('should throw on network error', async () => {
      mockAxios.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(getCodeOutputDownloadStream('s/f')).rejects.toThrow();
    });
  });

  describe('uploadCodeEnvFile', () => {
    const baseUploadParams = {
      req: { user: { id: 'user-123' } },
      stream: Readable.from(['file-content']),
      filename: 'data.csv',
      kind: 'user',
      id: 'user-123',
    };

    it('should pass dedicated keepAlive:false agents to axios', async () => {
      mockAxios.post.mockResolvedValue({
        data: {
          message: 'success',
          storage_session_id: 'sess-1',
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
          storage_session_id: 'sess-1',
          files: [{ fileId: 'fid-1', filename: 'data.csv' }],
        },
      });

      await uploadCodeEnvFile(baseUploadParams);

      const callConfig = mockAxios.post.mock.calls[0][2];
      expect(callConfig.timeout).toBe(120000);
    });

    it('should return { storage_session_id, file_id } on success', async () => {
      mockAxios.post.mockResolvedValue({
        data: {
          message: 'success',
          storage_session_id: 'sess-1',
          files: [{ fileId: 'fid-1', filename: 'data.csv' }],
        },
      });

      const result = await uploadCodeEnvFile(baseUploadParams);
      expect(result).toEqual({ storage_session_id: 'sess-1', file_id: 'fid-1' });
    });

    /* Phase C / option α (codeapi #1455): the upload wire carries the
     * resource identity codeapi uses for sessionKey derivation. Without
     * these on the form, codeapi falls back to user bucketing for every
     * upload and skill-cache invalidation never fires. Validation runs
     * client-side too so a bad caller fails fast instead of round-tripping
     * a 400. */
    describe('codeapi resource identity (kind/id/version)', () => {
      const FormData = require('form-data');
      const successResponse = {
        data: {
          message: 'success',
          storage_session_id: 'sess-1',
          files: [{ fileId: 'fid-1', filename: 'data.csv' }],
        },
      };
      let appendSpy;

      beforeEach(() => {
        /* Spying on the prototype lets us assert form fields without
         * materializing the multipart body — `form.getBuffer()` would
         * fail on the file-stream entry, but we don't care about the
         * stream here, only the identity fields that ride beside it. */
        appendSpy = jest.spyOn(FormData.prototype, 'append');
      });

      afterEach(() => {
        appendSpy.mockRestore();
      });

      const fieldsAppended = () =>
        appendSpy.mock.calls
          .filter((call) => typeof call[1] === 'string' || typeof call[1] === 'number')
          .reduce((acc, [name, value]) => ({ ...acc, [name]: value }), {});

      it('forwards kind, id, and (when skill) version on the multipart form', async () => {
        mockAxios.post.mockResolvedValue(successResponse);

        await uploadCodeEnvFile({
          ...baseUploadParams,
          kind: 'skill',
          id: 'skill-42',
          version: 7,
        });

        expect(fieldsAppended()).toEqual({ kind: 'skill', id: 'skill-42', version: '7' });
      });

      it('omits version on the form for non-skill kinds', async () => {
        mockAxios.post.mockResolvedValue(successResponse);

        await uploadCodeEnvFile({ ...baseUploadParams, kind: 'agent', id: 'agent-9' });

        const fields = fieldsAppended();
        expect(fields).toEqual({ kind: 'agent', id: 'agent-9' });
        expect(fields).not.toHaveProperty('version');
      });

      it('rejects unknown kind without dispatching to codeapi', async () => {
        await expect(
          uploadCodeEnvFile({ ...baseUploadParams, kind: 'system', id: 'x' }),
        ).rejects.toThrow(/invalid kind/);
        expect(mockAxios.post).not.toHaveBeenCalled();
      });

      it('rejects skill upload without a version (mirrors codeapi validator)', async () => {
        await expect(
          uploadCodeEnvFile({ ...baseUploadParams, kind: 'skill', id: 'skill-42' }),
        ).rejects.toThrow(/skill.*version/);
        expect(mockAxios.post).not.toHaveBeenCalled();
      });

      it('rejects version on non-skill kinds (mirrors codeapi validator)', async () => {
        await expect(
          uploadCodeEnvFile({
            ...baseUploadParams,
            kind: 'agent',
            id: 'agent-9',
            version: 3,
          }),
        ).rejects.toThrow(/version.*skill/);
        expect(mockAxios.post).not.toHaveBeenCalled();
      });
    });

    it('should throw when server returns non-success message', async () => {
      mockAxios.post.mockResolvedValue({
        data: { message: 'quota_exceeded', storage_session_id: 's', files: [] },
      });

      await expect(uploadCodeEnvFile(baseUploadParams)).rejects.toThrow('quota_exceeded');
    });

    it('should throw on network error', async () => {
      mockAxios.post.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(uploadCodeEnvFile(baseUploadParams)).rejects.toThrow();
    });
  });
});
