// Configurable file size limit for tests - use a getter so it can be changed per test
const fileSizeLimitConfig = { value: 20 * 1024 * 1024 }; // Default 20MB

// Mock librechat-data-provider with configurable file size limit
jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    mergeFileConfig: jest.fn((config) => {
      const merged = actual.mergeFileConfig(config);
      // Override the serverFileSizeLimit with our test value
      return {
        ...merged,
        get serverFileSizeLimit() {
          return fileSizeLimitConfig.value;
        },
      };
    }),
    getEndpointFileConfig: jest.fn((options) => {
      const config = actual.getEndpointFileConfig(options);
      // Override fileSizeLimit with our test value
      return {
        ...config,
        get fileSizeLimit() {
          return fileSizeLimitConfig.value;
        },
      };
    }),
  };
});

const { FileContext } = require('librechat-data-provider');

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

// Mock axios — process.js now uses createAxiosInstance() from @librechat/api
const mockAxios = jest.fn();
mockAxios.post = jest.fn();
mockAxios.isAxiosError = jest.fn(() => false);

const mockClassifyCodeArtifact = jest.fn(() => 'other');
const mockExtractCodeArtifactText = jest.fn(async () => null);
jest.mock('@librechat/api', () => {
  const http = require('http');
  const https = require('https');
  return {
    logAxiosError: jest.fn(),
    getBasePath: jest.fn(() => ''),
    sanitizeFilename: jest.fn((name) => name),
    createAxiosInstance: jest.fn(() => mockAxios),
    classifyCodeArtifact: (...args) => mockClassifyCodeArtifact(...args),
    extractCodeArtifactText: (...args) => mockExtractCodeArtifactText(...args),
    codeServerHttpAgent: new http.Agent({ keepAlive: false }),
    codeServerHttpsAgent: new https.Agent({ keepAlive: false }),
  };
});

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@librechat/agents', () => ({
  getCodeBaseURL: jest.fn(() => 'https://code-api.example.com'),
}));

// Mock models
const mockClaimCodeFile = jest.fn();
jest.mock('~/models', () => ({
  createFile: jest.fn().mockResolvedValue({}),
  getFiles: jest.fn(),
  updateFile: jest.fn(),
  claimCodeFile: (...args) => mockClaimCodeFile(...args),
}));

// Mock permissions (must be before process.js import)
jest.mock('~/server/services/Files/permissions', () => ({
  filterFilesByAgentAccess: jest.fn((options) => Promise.resolve(options.files)),
}));

// Mock strategy functions
jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(),
}));

// Mock convertImage
jest.mock('~/server/services/Files/images/convert', () => ({
  convertImage: jest.fn(),
}));

// Mock determineFileType
jest.mock('~/server/utils', () => ({
  determineFileType: jest.fn(),
}));

const http = require('http');
const https = require('https');
const { createFile, getFiles } = require('~/models');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { convertImage } = require('~/server/services/Files/images/convert');
const { determineFileType } = require('~/server/utils');
const { logger } = require('@librechat/data-schemas');
const { codeServerHttpAgent, codeServerHttpsAgent } = require('@librechat/api');

const { processCodeOutput, getSessionInfo, readSandboxFile } = require('./process');

describe('Code Process', () => {
  const mockReq = {
    user: { id: 'user-123' },
    config: {
      fileConfig: {},
      fileStrategy: 'local',
      imageOutputType: 'webp',
    },
  };

  const baseParams = {
    req: mockReq,
    id: 'file-id-123',
    name: 'test-file.txt',
    apiKey: 'test-api-key',
    toolCallId: 'tool-call-123',
    conversationId: 'conv-123',
    messageId: 'msg-123',
    session_id: 'session-123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock: atomic claim returns a new file record (no existing file)
    mockClaimCodeFile.mockResolvedValue({
      file_id: 'mock-uuid-1234',
      user: 'user-123',
    });
    getFiles.mockResolvedValue(null);
    createFile.mockResolvedValue({});
    getStrategyFunctions.mockReturnValue({
      saveBuffer: jest.fn().mockResolvedValue('/uploads/mock-file-path.txt'),
    });
    determineFileType.mockResolvedValue({ mime: 'text/plain' });
  });

  describe('atomic file claim (via processCodeOutput)', () => {
    it('should reuse file_id from existing record via atomic claim', async () => {
      mockClaimCodeFile.mockResolvedValue({
        file_id: 'existing-file-id',
        filename: 'test-file.txt',
        usage: 2,
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const smallBuffer = Buffer.alloc(100);
      mockAxios.mockResolvedValue({ data: smallBuffer });

      const result = await processCodeOutput(baseParams);

      expect(mockClaimCodeFile).toHaveBeenCalledWith({
        filename: 'test-file.txt',
        conversationId: 'conv-123',
        file_id: 'mock-uuid-1234',
        user: 'user-123',
      });

      expect(result.file_id).toBe('existing-file-id');
      expect(result.usage).toBe(3);
      expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should create new file when no existing file found', async () => {
      mockClaimCodeFile.mockResolvedValue({
        file_id: 'mock-uuid-1234',
        user: 'user-123',
      });

      const smallBuffer = Buffer.alloc(100);
      mockAxios.mockResolvedValue({ data: smallBuffer });

      const result = await processCodeOutput(baseParams);

      expect(result.file_id).toBe('mock-uuid-1234');
      expect(result.usage).toBe(1);
    });
  });

  describe('processCodeOutput', () => {
    describe('image file processing', () => {
      it('should process image files using convertImage', async () => {
        const imageParams = { ...baseParams, name: 'chart.png' };
        const imageBuffer = Buffer.alloc(500);
        mockAxios.mockResolvedValue({ data: imageBuffer });

        const convertedFile = {
          filepath: '/uploads/converted-image.webp',
          bytes: 400,
        };
        convertImage.mockResolvedValue(convertedFile);

        const result = await processCodeOutput(imageParams);

        expect(convertImage).toHaveBeenCalledWith(
          mockReq,
          imageBuffer,
          'high',
          'mock-uuid-1234.png',
        );
        expect(result.type).toBe('image/webp');
        expect(result.context).toBe(FileContext.execute_code);
        expect(result.filename).toBe('chart.png');
      });

      it('should update existing image file with cache-busted filepath', async () => {
        const imageParams = { ...baseParams, name: 'chart.png' };
        mockClaimCodeFile.mockResolvedValue({
          file_id: 'existing-img-id',
          usage: 1,
          createdAt: '2024-01-01T00:00:00.000Z',
        });

        const imageBuffer = Buffer.alloc(500);
        mockAxios.mockResolvedValue({ data: imageBuffer });
        convertImage.mockResolvedValue({ filepath: '/images/user-123/existing-img-id.webp' });

        const result = await processCodeOutput(imageParams);

        expect(convertImage).toHaveBeenCalledWith(
          mockReq,
          imageBuffer,
          'high',
          'existing-img-id.png',
        );
        expect(result.file_id).toBe('existing-img-id');
        expect(result.usage).toBe(2);
        expect(result.filepath).toMatch(/^\/images\/user-123\/existing-img-id\.webp\?v=\d+$/);
        expect(logger.debug).toHaveBeenCalledWith(
          expect.stringContaining('Updating existing file'),
        );
      });
    });

    describe('non-image file processing', () => {
      it('should process non-image files using saveBuffer', async () => {
        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });

        const mockSaveBuffer = jest.fn().mockResolvedValue('/uploads/saved-file.txt');
        getStrategyFunctions.mockReturnValue({ saveBuffer: mockSaveBuffer });
        determineFileType.mockResolvedValue({ mime: 'text/plain' });

        const result = await processCodeOutput(baseParams);

        expect(mockSaveBuffer).toHaveBeenCalledWith({
          userId: 'user-123',
          buffer: smallBuffer,
          fileName: 'mock-uuid-1234__test-file.txt',
          basePath: 'uploads',
        });
        expect(result.type).toBe('text/plain');
        expect(result.filepath).toBe('/uploads/saved-file.txt');
        expect(result.bytes).toBe(100);
      });

      it('should detect MIME type from buffer', async () => {
        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });
        determineFileType.mockResolvedValue({ mime: 'application/pdf' });

        const result = await processCodeOutput({ ...baseParams, name: 'document.pdf' });

        expect(determineFileType).toHaveBeenCalledWith(smallBuffer, true);
        expect(result.type).toBe('application/pdf');
      });

      it('should fallback to application/octet-stream for unknown types', async () => {
        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });
        determineFileType.mockResolvedValue(null);

        const result = await processCodeOutput({ ...baseParams, name: 'unknown.xyz' });

        expect(result.type).toBe('application/octet-stream');
      });
    });

    describe('inline text extraction', () => {
      it('should populate text on the file when extractor returns content', async () => {
        const buffer = Buffer.from('hello world\n', 'utf-8');
        mockAxios.mockResolvedValue({ data: buffer });
        determineFileType.mockResolvedValue({ mime: 'text/plain' });
        mockClassifyCodeArtifact.mockReturnValueOnce('utf8-text');
        mockExtractCodeArtifactText.mockResolvedValueOnce('hello world\n');

        const result = await processCodeOutput({ ...baseParams, name: 'note.txt' });

        expect(mockClassifyCodeArtifact).toHaveBeenCalledWith('note.txt', 'text/plain');
        expect(mockExtractCodeArtifactText).toHaveBeenCalledWith(
          buffer,
          'note.txt',
          'text/plain',
          'utf8-text',
        );
        expect(result.text).toBe('hello world\n');
        expect(createFile).toHaveBeenCalledWith(
          expect.objectContaining({ text: 'hello world\n' }),
          true,
        );
      });

      it('should set text to null when extractor returns null so updates clear stale values', async () => {
        const buffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: buffer });
        determineFileType.mockResolvedValue({ mime: 'application/octet-stream' });
        mockClassifyCodeArtifact.mockReturnValueOnce('other');
        mockExtractCodeArtifactText.mockResolvedValueOnce(null);

        const result = await processCodeOutput({ ...baseParams, name: 'archive.zip' });

        expect(result.text).toBeNull();
        const createCall = createFile.mock.calls[0][0];
        expect(createCall.text).toBeNull();
      });

      it('should overwrite a previously-stored text value when re-emitting a now-binary file', async () => {
        // Same filename + conversationId already has a stored text value;
        // claimCodeFile returns the existing record (isUpdate path).
        mockClaimCodeFile.mockResolvedValueOnce({
          file_id: 'existing-id',
          filename: 'output.bin',
          usage: 1,
          createdAt: '2024-01-01T00:00:00.000Z',
        });
        const binaryBuffer = Buffer.from([0x00, 0xff, 0x00, 0xff]);
        mockAxios.mockResolvedValue({ data: binaryBuffer });
        determineFileType.mockResolvedValue({ mime: 'application/octet-stream' });
        mockClassifyCodeArtifact.mockReturnValueOnce('other');
        mockExtractCodeArtifactText.mockResolvedValueOnce(null);

        await processCodeOutput({ ...baseParams, name: 'output.bin' });

        // null (not omitted) so $set clears any prior `text` value.
        const createCall = createFile.mock.calls[0][0];
        expect(createCall).toHaveProperty('text', null);
      });

      it('should not invoke text extraction for image files', async () => {
        const imageBuffer = Buffer.alloc(500);
        mockAxios.mockResolvedValue({ data: imageBuffer });
        convertImage.mockResolvedValue({ filepath: '/uploads/x.webp', bytes: 400 });

        await processCodeOutput({ ...baseParams, name: 'chart.png' });

        expect(mockClassifyCodeArtifact).not.toHaveBeenCalled();
        expect(mockExtractCodeArtifactText).not.toHaveBeenCalled();
      });
    });

    describe('file size limit enforcement', () => {
      it('should fallback to download URL when file exceeds size limit', async () => {
        // Set a small file size limit for this test
        fileSizeLimitConfig.value = 1000; // 1KB limit

        const largeBuffer = Buffer.alloc(5000); // 5KB - exceeds 1KB limit
        mockAxios.mockResolvedValue({ data: largeBuffer });

        const result = await processCodeOutput(baseParams);

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('exceeds size limit'));
        expect(result.filepath).toContain('/api/files/code/download/session-123/file-id-123');
        expect(result.expiresAt).toBeDefined();
        // Should not call createFile for oversized files (fallback path)
        expect(createFile).not.toHaveBeenCalled();

        // Reset to default for other tests
        fileSizeLimitConfig.value = 20 * 1024 * 1024;
      });
    });

    describe('fallback behavior', () => {
      it('should fallback to download URL when saveBuffer is not available', async () => {
        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });
        getStrategyFunctions.mockReturnValue({ saveBuffer: null });

        const result = await processCodeOutput(baseParams);

        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('saveBuffer not available'),
        );
        expect(result.filepath).toContain('/api/files/code/download/');
        expect(result.filename).toBe('test-file.txt');
      });

      it('should fallback to download URL on axios error', async () => {
        mockAxios.mockRejectedValue(new Error('Network error'));

        const result = await processCodeOutput(baseParams);

        expect(result.filepath).toContain('/api/files/code/download/session-123/file-id-123');
        expect(result.conversationId).toBe('conv-123');
        expect(result.messageId).toBe('msg-123');
        expect(result.toolCallId).toBe('tool-call-123');
      });
    });

    describe('usage counter increment', () => {
      it('should set usage to 1 for new files', async () => {
        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });

        const result = await processCodeOutput(baseParams);

        expect(result.usage).toBe(1);
      });

      it('should increment usage for existing files', async () => {
        mockClaimCodeFile.mockResolvedValue({
          file_id: 'existing-id',
          usage: 5,
          createdAt: '2024-01-01',
        });
        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });

        const result = await processCodeOutput(baseParams);

        expect(result.usage).toBe(6);
      });

      it('should handle existing file with undefined usage', async () => {
        mockClaimCodeFile.mockResolvedValue({
          file_id: 'existing-id',
          createdAt: '2024-01-01',
        });
        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });

        const result = await processCodeOutput(baseParams);

        expect(result.usage).toBe(1);
      });
    });

    describe('metadata and file properties', () => {
      it('should include fileIdentifier in metadata', async () => {
        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });

        const result = await processCodeOutput(baseParams);

        expect(result.metadata).toEqual({
          fileIdentifier: 'session-123/file-id-123',
        });
      });

      it('should set correct context for code-generated files', async () => {
        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });

        const result = await processCodeOutput(baseParams);

        expect(result.context).toBe(FileContext.execute_code);
      });

      it('should include toolCallId and messageId in result', async () => {
        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });

        const result = await processCodeOutput(baseParams);

        expect(result.toolCallId).toBe('tool-call-123');
        expect(result.messageId).toBe('msg-123');
      });

      it('should call createFile with upsert enabled', async () => {
        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });

        await processCodeOutput(baseParams);

        expect(createFile).toHaveBeenCalledWith(
          expect.objectContaining({
            file_id: 'mock-uuid-1234',
            context: FileContext.execute_code,
          }),
          true, // upsert flag
        );
      });
    });

    describe('persistedMessageId (regression for cross-turn priming)', () => {
      /**
       * `getCodeGeneratedFiles` filters by `messageId IN <thread message ids>`
       * to scope files to the current branch. If `processCodeOutput` overwrote
       * the file's `messageId` with the current run's id on every update, a
       * file re-touched by a later turn (e.g. a failed read attempt that
       * re-shells the same filename) would lose its link to the assistant
       * message that originally produced it. Subsequent turns then can't find
       * it via `getCodeGeneratedFiles`, the priming chain has nothing to seed,
       * and the model thinks its own prior-turn artifact disappeared.
       *
       * Contract:
       *  - On UPDATE (claimCodeFile returned an existing record): the persisted
       *    `messageId` is `claimed.messageId` (preserved). Falls back to the
       *    current run's `messageId` when the existing record predates the
       *    `messageId` field (legacy data).
       *  - On CREATE (new file): the persisted `messageId` is the current run's.
       *  - The runtime return value ALWAYS uses the current run's `messageId`
       *    via `Object.assign(file, { messageId, toolCallId })` so the artifact
       *    attaches to the correct tool_call in the live response.
       */

      /**
       * `processCodeOutput` mutates the file object after `createFile` returns
       * (`Object.assign(file, { messageId, toolCallId })`) so the runtime
       * caller sees the live messageId on the response. Reading
       * `createFile.mock.calls[0][0]` directly would therefore reflect the
       * post-mutation state because JS captures by reference. To assert
       * what was actually PERSISTED, snapshot the args at call time.
       */
      function snapshotCreateFileArgs() {
        const snapshots = [];
        createFile.mockImplementation(async (file) => {
          snapshots.push({ ...file });
          return {};
        });
        return snapshots;
      }

      it('preserves the original messageId in the persisted record on UPDATE', async () => {
        mockClaimCodeFile.mockResolvedValue({
          file_id: 'existing-id',
          filename: 'sentinel.txt',
          usage: 1,
          createdAt: '2024-01-01T00:00:00.000Z',
          messageId: 'turn-1-original-msg',
        });
        const persisted = snapshotCreateFileArgs();

        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });

        await processCodeOutput({
          ...baseParams,
          name: 'sentinel.txt',
          messageId: 'turn-2-current-run-msg',
        });

        expect(persisted[0].messageId).toBe('turn-1-original-msg');
      });

      it('falls back to current run messageId on UPDATE when claimed.messageId is undefined (legacy record)', async () => {
        // Legacy record predates the persistedMessageId tracking.
        mockClaimCodeFile.mockResolvedValue({
          file_id: 'legacy-id',
          filename: 'legacy.txt',
          usage: 1,
          createdAt: '2024-01-01T00:00:00.000Z',
          // messageId intentionally absent
        });
        const persisted = snapshotCreateFileArgs();

        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });

        await processCodeOutput({
          ...baseParams,
          name: 'legacy.txt',
          messageId: 'turn-N-current-run-msg',
        });

        expect(persisted[0].messageId).toBe('turn-N-current-run-msg');
      });

      it('uses the current run messageId on CREATE (no claimed record)', async () => {
        mockClaimCodeFile.mockResolvedValue({
          file_id: 'mock-uuid-1234',
          user: 'user-123',
        });
        const persisted = snapshotCreateFileArgs();

        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });

        await processCodeOutput({
          ...baseParams,
          messageId: 'turn-1-create-msg',
        });

        expect(persisted[0].messageId).toBe('turn-1-create-msg');
      });

      it('returns the CURRENT run messageId in the runtime response even on UPDATE (artifact attribution)', async () => {
        // The persisted DB record keeps the original messageId, but the
        // returned object surfaces the live messageId so the artifact lands
        // on the correct tool_call in this run's response.
        mockClaimCodeFile.mockResolvedValue({
          file_id: 'existing-id',
          filename: 'sentinel.txt',
          usage: 1,
          createdAt: '2024-01-01T00:00:00.000Z',
          messageId: 'turn-1-original-msg',
        });
        const persisted = snapshotCreateFileArgs();

        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });

        const result = await processCodeOutput({
          ...baseParams,
          name: 'sentinel.txt',
          messageId: 'turn-2-current-run-msg',
        });

        // DB preserves original
        expect(persisted[0].messageId).toBe('turn-1-original-msg');
        // Runtime return surfaces the live (current) messageId
        expect(result.messageId).toBe('turn-2-current-run-msg');
      });

      it('preserves the original messageId on UPDATE for image files too', async () => {
        // Same contract as text files; the image branch builds its own file
        // record and would silently regress if the ternary diverged there.
        mockClaimCodeFile.mockResolvedValue({
          file_id: 'existing-img',
          filename: 'chart.png',
          usage: 1,
          createdAt: '2024-01-01T00:00:00.000Z',
          messageId: 'turn-1-image-msg',
        });
        const persisted = snapshotCreateFileArgs();

        const imageBuffer = Buffer.alloc(500);
        mockAxios.mockResolvedValue({ data: imageBuffer });
        convertImage.mockResolvedValue({
          filepath: '/uploads/chart.webp',
          bytes: 400,
        });

        await processCodeOutput({
          ...baseParams,
          name: 'chart.png',
          messageId: 'turn-2-current-img-msg',
        });

        expect(persisted[0].messageId).toBe('turn-1-image-msg');
      });
    });

    describe('socket pool isolation', () => {
      it('should pass dedicated keepAlive:false agents to axios for processCodeOutput', async () => {
        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });

        await processCodeOutput(baseParams);

        const callConfig = mockAxios.mock.calls[0][0];
        expect(callConfig.httpAgent).toBe(codeServerHttpAgent);
        expect(callConfig.httpsAgent).toBe(codeServerHttpsAgent);
        expect(callConfig.httpAgent).toBeInstanceOf(http.Agent);
        expect(callConfig.httpsAgent).toBeInstanceOf(https.Agent);
        expect(callConfig.httpAgent.keepAlive).toBe(false);
        expect(callConfig.httpsAgent.keepAlive).toBe(false);
      });

      it('should pass dedicated keepAlive:false agents to axios for getSessionInfo', async () => {
        mockAxios.mockResolvedValue({
          data: [{ name: 'sess/fid', lastModified: new Date().toISOString() }],
        });

        await getSessionInfo('sess/fid', 'api-key');

        const callConfig = mockAxios.mock.calls[0][0];
        expect(callConfig.httpAgent).toBe(codeServerHttpAgent);
        expect(callConfig.httpsAgent).toBe(codeServerHttpsAgent);
        expect(callConfig.httpAgent.keepAlive).toBe(false);
        expect(callConfig.httpsAgent.keepAlive).toBe(false);
      });
    });
  });

  describe('readSandboxFile', () => {
    /**
     * `readSandboxFile` shells `cat <file_path>` through the sandbox
     * `/exec` endpoint. The `file_path` argument is model-controlled, so
     * the single-quote escaping is a security boundary — a regression
     * here would let a malicious filename break out of the `cat`
     * argument and inject arbitrary shell. Lock the contract in tests.
     */

    /** Pull the bash code that the helper would send to /exec, given
     *  the file_path that the model supplied. */
    function execCodeFor(file_path) {
      mockAxios.mockResolvedValueOnce({ data: { stdout: '', stderr: '' } });
      return readSandboxFile({ file_path }).then(() => {
        const postData = mockAxios.mock.calls[0][0].data;
        return postData.code;
      });
    }

    describe('shell quoting (security boundary)', () => {
      it('wraps a plain filename in single quotes', async () => {
        const code = await execCodeFor('/mnt/data/sentinel.txt');
        expect(code).toBe(`cat '/mnt/data/sentinel.txt'`);
      });

      it("escapes a literal single-quote in the filename via the standard '\\'' sequence", async () => {
        // Adversarial filename: `quote'breakout.txt`. Naive
        // single-quoting would terminate the quoted string and
        // inject the trailing `breakout.txt'` as shell tokens.
        const code = await execCodeFor(`/mnt/data/quote'breakout.txt`);
        // Expected escape: end the string, escape a literal quote,
        // start a new string. POSIX-portable.
        expect(code).toBe(`cat '/mnt/data/quote'\\''breakout.txt'`);
      });

      it('does not interpret command substitution syntax inside the quoted argument', async () => {
        // `$(rm -rf /)` would expand if the path were unquoted or
        // double-quoted. Inside POSIX single-quotes it stays literal.
        const code = await execCodeFor('/mnt/data/$(rm -rf /).txt');
        expect(code).toBe(`cat '/mnt/data/$(rm -rf /).txt'`);
      });

      it('does not expand backtick command substitution inside the quoted argument', async () => {
        const code = await execCodeFor('/mnt/data/`whoami`.txt');
        expect(code).toBe(`cat '/mnt/data/\`whoami\`.txt'`);
      });

      it('keeps newlines literal inside the quoted argument', async () => {
        const code = await execCodeFor('/mnt/data/line1\nline2.txt');
        expect(code).toBe(`cat '/mnt/data/line1\nline2.txt'`);
      });

      it('keeps spaces and other shell metacharacters literal', async () => {
        const code = await execCodeFor('/mnt/data/file ; ls -la /etc/passwd');
        expect(code).toBe(`cat '/mnt/data/file ; ls -la /etc/passwd'`);
      });

      it('handles multiple consecutive single-quotes', async () => {
        const code = await execCodeFor(`a''b`);
        // Each `'` becomes the 4-char escape sequence.
        expect(code).toBe(`cat 'a'\\'''\\''b'`);
      });
    });

    describe('payload shape', () => {
      it('POSTs to /exec on the configured codeapi base URL with bash language', async () => {
        mockAxios.mockResolvedValueOnce({ data: { stdout: 'ok', stderr: '' } });

        await readSandboxFile({ file_path: '/mnt/data/x.txt' });

        const call = mockAxios.mock.calls[0][0];
        expect(call.method).toBe('post');
        expect(call.url).toBe('https://code-api.example.com/exec');
        expect(call.data.lang).toBe('bash');
      });

      it('omits session_id and files when not provided', async () => {
        mockAxios.mockResolvedValueOnce({ data: { stdout: '', stderr: '' } });

        await readSandboxFile({ file_path: '/mnt/data/x.txt' });

        const data = mockAxios.mock.calls[0][0].data;
        expect(data).not.toHaveProperty('session_id');
        expect(data).not.toHaveProperty('files');
      });

      it('forwards session_id when provided so the read lands in the seeded sandbox', async () => {
        mockAxios.mockResolvedValueOnce({ data: { stdout: '', stderr: '' } });

        await readSandboxFile({
          file_path: '/mnt/data/x.txt',
          session_id: 'sess-XYZ',
        });

        expect(mockAxios.mock.calls[0][0].data.session_id).toBe('sess-XYZ');
      });

      it('forwards files (non-empty array) so prior-turn artifacts are mounted', async () => {
        mockAxios.mockResolvedValueOnce({ data: { stdout: '', stderr: '' } });

        const files = [{ id: 'f1', name: 'sentinel.txt', session_id: 'sess-XYZ' }];
        await readSandboxFile({
          file_path: '/mnt/data/sentinel.txt',
          session_id: 'sess-XYZ',
          files,
        });

        expect(mockAxios.mock.calls[0][0].data.files).toEqual(files);
      });

      it('omits files when an empty array is provided (cleaner payload)', async () => {
        mockAxios.mockResolvedValueOnce({ data: { stdout: '', stderr: '' } });

        await readSandboxFile({
          file_path: '/mnt/data/x.txt',
          session_id: 'sess-XYZ',
          files: [],
        });

        expect(mockAxios.mock.calls[0][0].data).not.toHaveProperty('files');
      });

      it('uses dedicated keepAlive:false agents (matches processCodeOutput pool isolation)', async () => {
        mockAxios.mockResolvedValueOnce({ data: { stdout: '', stderr: '' } });

        await readSandboxFile({ file_path: '/mnt/data/x.txt' });

        const call = mockAxios.mock.calls[0][0];
        expect(call.httpAgent).toBe(codeServerHttpAgent);
        expect(call.httpsAgent).toBe(codeServerHttpsAgent);
      });
    });

    describe('response handling', () => {
      it('returns { content: stdout } on success', async () => {
        mockAxios.mockResolvedValueOnce({
          data: { stdout: 'sentinel-XYZ-1234\n', stderr: '' },
        });

        const result = await readSandboxFile({ file_path: '/mnt/data/sentinel.txt' });

        expect(result).toEqual({ content: 'sentinel-XYZ-1234\n' });
      });

      it('returns null when getCodeBaseURL is not configured', async () => {
        const { getCodeBaseURL } = require('@librechat/agents');
        getCodeBaseURL.mockReturnValueOnce('');

        const result = await readSandboxFile({ file_path: '/mnt/data/x.txt' });

        expect(result).toBeNull();
        expect(mockAxios).not.toHaveBeenCalled();
      });

      it('returns null when stdout is missing entirely (no content to surface)', async () => {
        // stdout absent + no stderr = nothing to report; caller turns this
        // into a model-visible "Failed to read" message.
        mockAxios.mockResolvedValueOnce({ data: { stderr: '' } });

        const result = await readSandboxFile({ file_path: '/mnt/data/x.txt' });

        expect(result).toBeNull();
      });

      it('throws when the command writes to stderr with no stdout (exposes the error to the caller)', async () => {
        mockAxios.mockResolvedValueOnce({
          data: { stdout: '', stderr: 'cat: /mnt/data/missing.txt: No such file or directory\n' },
        });

        await expect(readSandboxFile({ file_path: '/mnt/data/missing.txt' })).rejects.toThrow(
          'cat: /mnt/data/missing.txt: No such file or directory',
        );
      });

      it('returns stdout even when stderr is also present (stdout wins on partial-success)', async () => {
        // Some `cat` builds emit warnings on stderr while still producing
        // stdout (e.g. unusual line endings). Surface the content.
        mockAxios.mockResolvedValueOnce({
          data: { stdout: 'partial', stderr: 'warning: ...' },
        });

        const result = await readSandboxFile({ file_path: '/mnt/data/x.txt' });

        expect(result).toEqual({ content: 'partial' });
      });

      it('rethrows axios transport errors after logging via logAxiosError', async () => {
        const { logAxiosError } = require('@librechat/api');
        const transportError = Object.assign(new Error('connect ECONNREFUSED'), {
          code: 'ECONNREFUSED',
        });
        mockAxios.mockRejectedValueOnce(transportError);

        await expect(readSandboxFile({ file_path: '/mnt/data/x.txt' })).rejects.toBe(
          transportError,
        );
        expect(logAxiosError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('/mnt/data/x.txt'),
            error: transportError,
          }),
        );
      });
    });

    describe('timeout', () => {
      it('uses the same 15s timeout as processCodeOutput (consistent code-server SLA)', async () => {
        mockAxios.mockResolvedValueOnce({ data: { stdout: '', stderr: '' } });

        await readSandboxFile({ file_path: '/mnt/data/x.txt' });

        expect(mockAxios.mock.calls[0][0].timeout).toBe(15000);
      });
    });
  });
});
