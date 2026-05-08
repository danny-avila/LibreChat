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
const mockGetExtractedTextFormat = jest.fn((_name, _mime, text) => (text == null ? null : 'text'));
/* `hasOfficeHtmlPath` gates the persist-then-render split: when true, processCodeOutput
 * returns `{ file, finalize }` with the file persisted at `status: 'pending'`
 * and `finalize` runs the background extraction. Default false here so the
 * legacy single-phase tests below (txt/png/etc) exercise the inline path
 * unchanged. The dedicated office/finalize describe block toggles it on. */
const mockHasOfficeHtmlPath = jest.fn(() => false);
/* Pass-through `withTimeout`: tests don't drive timeouts here (those live
 * in promise.spec.ts and the finalizePreview unit tests below). */
const passthroughWithTimeout = async (promise) => promise;
jest.mock('@librechat/api', () => {
  const http = require('http');
  const https = require('https');
  return {
    logAxiosError: jest.fn(),
    getBasePath: jest.fn(() => ''),
    sanitizeArtifactPath: jest.fn((name) => name),
    flattenArtifactPath: jest.fn((name) => name.replace(/\//g, '__')),
    createAxiosInstance: jest.fn(() => mockAxios),
    withTimeout: (...args) => passthroughWithTimeout(...args),
    hasOfficeHtmlPath: (...args) => mockHasOfficeHtmlPath(...args),
    /**
     * Arrow-function indirection (vs. a direct `jest.fn()` reference) so
     * tests can per-case `mockReturnValueOnce` / `mockImplementationOnce`
     * on `mockClassifyCodeArtifact` / `mockExtractCodeArtifactText`.
     * `jest.mock(...)` is hoisted above the outer `const` declarations
     * at parse time, so a direct reference here would capture
     * `undefined`; the arrow defers the binding to call time. The
     * direct-`jest.fn()` mocks below stay constant per file.
     */
    classifyCodeArtifact: (...args) => mockClassifyCodeArtifact(...args),
    extractCodeArtifactText: (...args) => mockExtractCodeArtifactText(...args),
    /* `processCodeOutput` derives the `textFormat` trust flag for
     * `IMongoFile` from this helper — Codex P1 review on PR #12934.
     * The mock returns 'text' for non-null extractor output and null
     * otherwise so the downstream `file.textFormat` field is set to
     * a believable shape without modeling the office-HTML branch
     * (the dispatcher under test isn't exercising that path). Per-
     * test overrides via `mockGetExtractedTextFormat.mockReturnValue`
     * if a case needs to assert the 'html' value. */
    getExtractedTextFormat: (...args) => mockGetExtractedTextFormat(...args),
    getStorageMetadata: jest.fn(() => ({})),
    /* Identity helpers mirror codeapi's validator. The real impl
     * lives in `packages/api/src/files/code/identity.ts` with its
     * own dedicated `identity.spec.ts`; here we just stub the
     * download-query builder since `processCodeOutput` calls it on
     * every output download. */
    buildCodeEnvDownloadQuery: jest.fn(({ kind, id, version }) => {
      const params = new URLSearchParams({ kind, id });
      if (version != null) params.set('version', String(version));
      return `?${params.toString()}`;
    }),
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
const { codeServerHttpAgent, codeServerHttpsAgent, getStorageMetadata } = require('@librechat/api');

const { processCodeOutput, getSessionInfo, readSandboxFile, primeFiles } = require('./process');

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

      const { file: result } = await processCodeOutput(baseParams);

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

      const { file: result } = await processCodeOutput(baseParams);

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

        const { file: result } = await processCodeOutput(imageParams);

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

      it('persists tenantId on image code output records when present', async () => {
        const tenantReq = { ...mockReq, user: { ...mockReq.user, tenantId: 'tenantA' } };
        const imageBuffer = Buffer.alloc(500);
        mockAxios.mockResolvedValue({ data: imageBuffer });
        convertImage.mockResolvedValue({
          filepath: '/t/tenantA/images/user-123/mock-uuid-1234.webp',
        });

        await processCodeOutput({
          ...baseParams,
          req: tenantReq,
          name: 'chart.png',
        });

        expect(mockClaimCodeFile).toHaveBeenCalledWith(
          expect.objectContaining({ tenantId: 'tenantA' }),
        );
        expect(createFile).toHaveBeenCalledWith(
          expect.objectContaining({ tenantId: 'tenantA' }),
          true,
        );
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

        const { file: result } = await processCodeOutput(imageParams);

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

        const { file: result } = await processCodeOutput(baseParams);

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

      it.each([
        [
          'slides.pptx',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ],
        ['sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        [
          'document.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
      ])('preserves stored metadata for code-generated office file %s', async (name, mime) => {
        const cloudfrontReq = {
          ...mockReq,
          user: { ...mockReq.user, tenantId: 'tenantA' },
          config: { ...mockReq.config, fileStrategy: 'cloudfront' },
        };
        const smallBuffer = Buffer.alloc(100);
        const filepath = `https://cdn.example.com/r/us-east-2/t/tenantA/uploads/user-123/mock-uuid-1234__${name}`;
        const storageKey = `r/us-east-2/t/tenantA/uploads/user-123/mock-uuid-1234__${name}`;
        mockAxios.mockResolvedValue({ data: smallBuffer });
        determineFileType.mockResolvedValue({ mime });
        mockHasOfficeHtmlPath.mockReturnValueOnce(true);
        getStorageMetadata.mockReturnValueOnce({ storageKey, storageRegion: 'us-east-2' });
        const mockSaveBuffer = jest.fn().mockResolvedValue(filepath);
        getStrategyFunctions.mockReturnValue({ saveBuffer: mockSaveBuffer });

        const { file: result, finalize } = await processCodeOutput({
          ...baseParams,
          req: cloudfrontReq,
          name,
        });

        expect(mockSaveBuffer).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-123',
            basePath: 'uploads',
            tenantId: 'tenantA',
          }),
        );
        expect(result).toMatchObject({
          file_id: 'mock-uuid-1234',
          user: 'user-123',
          tenantId: 'tenantA',
          source: 'cloudfront',
          filename: name,
          filepath,
          storageKey,
          storageRegion: 'us-east-2',
          status: 'pending',
        });
        expect(createFile).toHaveBeenCalledWith(
          expect.objectContaining({
            file_id: 'mock-uuid-1234',
            user: 'user-123',
            tenantId: 'tenantA',
            source: 'cloudfront',
            storageKey,
            storageRegion: 'us-east-2',
          }),
          true,
        );
        expect(typeof finalize).toBe('function');
      });

      it('passes and persists tenantId for non-image code output records', async () => {
        const tenantReq = { ...mockReq, user: { ...mockReq.user, tenantId: 'tenantA' } };
        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });

        const mockSaveBuffer = jest
          .fn()
          .mockResolvedValue('/t/tenantA/uploads/user-123/mock-file-path.txt');
        getStrategyFunctions.mockReturnValue({ saveBuffer: mockSaveBuffer });

        await processCodeOutput({
          ...baseParams,
          req: tenantReq,
        });

        expect(mockClaimCodeFile).toHaveBeenCalledWith(
          expect.objectContaining({ tenantId: 'tenantA' }),
        );
        expect(mockSaveBuffer).toHaveBeenCalledWith(
          expect.objectContaining({ tenantId: 'tenantA' }),
        );
        expect(createFile).toHaveBeenCalledWith(
          expect.objectContaining({ tenantId: 'tenantA' }),
          true,
        );
      });

      it('preserves nested directory paths in the DB record while flattening the storage key', async () => {
        /* Regression test for the silent-data-loss path: when codeapi reports a
         * file with a nested name like "test_folder/test_file.txt", LibreChat
         * used to feed it through `sanitizeFilename` (basename-only), which
         * persisted "test_file.txt" to the DB and made the file un-locatable on
         * the next prime() (cat /mnt/data/test_folder/test_file.txt would
         * 404). The fix: keep the path on the DB record (so primeFiles can
         * place it back at the same nested location), but flatten it for the
         * storage key (saveBuffer strategies key by single component). */
        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });
        const mockSaveBuffer = jest.fn().mockResolvedValue('/uploads/saved.txt');
        getStrategyFunctions.mockReturnValue({ saveBuffer: mockSaveBuffer });

        const { file: result } = await processCodeOutput({
          ...baseParams,
          name: 'test_folder/test_file.txt',
        });

        // Storage key flattens `/` to `__` so on-disk strategies don't
        // accidentally create real subdirectories under uploads/.
        expect(mockSaveBuffer).toHaveBeenCalledWith(
          expect.objectContaining({
            fileName: 'mock-uuid-1234__test_folder__test_file.txt',
          }),
        );
        // DB row keeps the nested path verbatim — that's what primeFiles
        // ships back to the sandbox on the next turn.
        expect(result.filename).toBe('test_folder/test_file.txt');
        // Claim is also keyed by the path-preserving name so the
        // (filename, conversationId) compound key stays consistent.
        expect(mockClaimCodeFile).toHaveBeenCalledWith(
          expect.objectContaining({ filename: 'test_folder/test_file.txt' }),
        );
      });

      it('passes a NAME_MAX-aware budget to flattenArtifactPath when composing the storage key', async () => {
        /* Codex review P1: per-segment caps on the path-preserving form
         * aren't enough — once the segments are joined with `__` for the
         * storage key, deeply-nested or moderately long paths can still
         * exceed filesystem NAME_MAX (255) and cause `ENAMETOOLONG` in
         * saveBuffer. processCodeOutput must pass a file_id-aware budget
         * to flattenArtifactPath so the cap holds end-to-end. The unit
         * tests in `packages/api/src/utils/files.spec.ts` cover the
         * truncation logic itself; this test covers the integration. */
        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });
        const mockSaveBuffer = jest.fn().mockResolvedValue('/uploads/saved.bin');
        getStrategyFunctions.mockReturnValue({ saveBuffer: mockSaveBuffer });

        const flattenSpy = require('@librechat/api').flattenArtifactPath;
        flattenSpy.mockClear();

        await processCodeOutput({ ...baseParams, name: 'a/b/c.csv' });

        // The handler should call flattenArtifactPath with both the
        // safeName AND a budget = NAME_MAX (255) minus the prefix
        // (`${file_id}__`). file_id mock is `mock-uuid-1234` (14 chars),
        // so the budget should be 255 - 14 - 2 = 239.
        expect(flattenSpy).toHaveBeenCalledWith(expect.any(String), 239);
      });

      it('passes the basename (not the full nested path) to classifyCodeArtifact and extractCodeArtifactText', async () => {
        /* Codex review P2: with the path-preserving sanitizer, `safeName`
         * can be a nested string like `reports.v1/Makefile`. The
         * classifier reads `extensionOf` against the full string, which
         * sees `.v1/Makefile` after the dotted-dir's first dot and
         * misclassifies the file as `other` (so text extraction is
         * skipped). Pass `path.basename(safeName)` instead. */
        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });
        const mockSaveBuffer = jest.fn().mockResolvedValue('/uploads/saved.txt');
        getStrategyFunctions.mockReturnValue({ saveBuffer: mockSaveBuffer });

        await processCodeOutput({
          ...baseParams,
          name: 'reports.v1/Makefile',
        });

        expect(mockClassifyCodeArtifact).toHaveBeenCalledWith('Makefile', expect.any(String));
        expect(mockExtractCodeArtifactText).toHaveBeenCalledWith(
          expect.any(Buffer),
          'Makefile',
          expect.any(String),
          expect.any(String),
        );
      });

      it('should detect MIME type from buffer', async () => {
        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });
        determineFileType.mockResolvedValue({ mime: 'application/pdf' });

        const { file: result } = await processCodeOutput({ ...baseParams, name: 'document.pdf' });

        expect(determineFileType).toHaveBeenCalledWith(smallBuffer, true);
        expect(result.type).toBe('application/pdf');
      });

      it('should fallback to application/octet-stream for unknown types', async () => {
        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });
        determineFileType.mockResolvedValue(null);

        const { file: result } = await processCodeOutput({ ...baseParams, name: 'unknown.xyz' });

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

        const { file: result } = await processCodeOutput({ ...baseParams, name: 'note.txt' });

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

        const { file: result } = await processCodeOutput({ ...baseParams, name: 'archive.zip' });

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

      it('clears deferred-preview lifecycle fields so a prior office record at this file_id stops looking pending', async () => {
        /* Codex P2: same (filename, conversationId) was previously an
         * office artifact, leaving status/previewError/previewRevision
         * populated. The non-office update must reset them or the
         * client renders the wrong state for the now non-office file. */
        mockClaimCodeFile.mockResolvedValueOnce({
          file_id: 'reused-id',
          filename: 'output.txt',
          usage: 1,
          createdAt: '2024-01-01T00:00:00.000Z',
        });
        mockAxios.mockResolvedValue({ data: Buffer.from('hello') });
        determineFileType.mockResolvedValue({ mime: 'text/plain' });
        mockClassifyCodeArtifact.mockReturnValueOnce('text');
        mockHasOfficeHtmlPath.mockReturnValueOnce(false);
        mockExtractCodeArtifactText.mockResolvedValueOnce('hello');

        await processCodeOutput({ ...baseParams, name: 'output.txt' });

        const createCall = createFile.mock.calls[0][0];
        expect(createCall).toHaveProperty('status', null);
        expect(createCall).toHaveProperty('previewError', null);
        expect(createCall).toHaveProperty('previewRevision', null);
      });
    });

    describe('file size limit enforcement', () => {
      it('should fallback to download URL when file exceeds size limit', async () => {
        // Set a small file size limit for this test
        fileSizeLimitConfig.value = 1000; // 1KB limit

        const largeBuffer = Buffer.alloc(5000); // 5KB - exceeds 1KB limit
        mockAxios.mockResolvedValue({ data: largeBuffer });

        const { file: result } = await processCodeOutput(baseParams);

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

        const { file: result } = await processCodeOutput(baseParams);

        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('saveBuffer not available'),
        );
        expect(result.filepath).toContain('/api/files/code/download/');
        expect(result.filename).toBe('test-file.txt');
      });

      it('should fallback to download URL on axios error', async () => {
        mockAxios.mockRejectedValue(new Error('Network error'));

        const { file: result } = await processCodeOutput(baseParams);

        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Falling back to Code API download URL for strategy local'),
        );
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

        const { file: result } = await processCodeOutput(baseParams);

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

        const { file: result } = await processCodeOutput(baseParams);

        expect(result.usage).toBe(6);
      });

      it('should handle existing file with undefined usage', async () => {
        mockClaimCodeFile.mockResolvedValue({
          file_id: 'existing-id',
          createdAt: '2024-01-01',
        });
        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });

        const { file: result } = await processCodeOutput(baseParams);

        expect(result.usage).toBe(1);
      });
    });

    describe('metadata and file properties', () => {
      it('should include codeEnvRef in metadata with kind: user', async () => {
        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });

        const { file: result } = await processCodeOutput(baseParams);

        expect(result.metadata).toEqual({
          codeEnvRef: {
            kind: 'user',
            id: 'user-123',
            storage_session_id: 'session-123',
            file_id: 'file-id-123',
          },
        });
      });

      /* Phase C lock-in: outputs are ALWAYS user-scoped, never skill-scoped.
       * Even when an execution turn invoked a skill (so input files were
       * `kind: 'skill'` shared cross-user), the resulting output bucket
       * tags `kind: 'user'` with the requesting user's id. This prevents
       * cross-user leakage of artifacts a skill may have generated for
       * one user — each user gets their own output sessionKey on codeapi.
       *
       * Drift hazard: someone reading the simple user-derivation may
       * later think "we should respect input kind for outputs too" and
       * widen output scope to match input scope. This test pins the
       * intentional asymmetry so that change requires updating the test
       * (and re-reading the rationale). */
      it('outputs are user-scoped regardless of which skill the execution invoked', async () => {
        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });

        const userA = { ...mockReq, user: { id: 'user-A' } };
        const userB = { ...mockReq, user: { id: 'user-B' } };

        const { file: outputA } = await processCodeOutput({ ...baseParams, req: userA });
        const { file: outputB } = await processCodeOutput({ ...baseParams, req: userB });

        // Each user's output ref is keyed by their own user id. The
        // `id` field tracks the requesting user, never the skill.
        expect(outputA.metadata.codeEnvRef).toEqual({
          kind: 'user',
          id: 'user-A',
          storage_session_id: 'session-123',
          file_id: 'file-id-123',
        });
        expect(outputB.metadata.codeEnvRef).toEqual({
          kind: 'user',
          id: 'user-B',
          storage_session_id: 'session-123',
          file_id: 'file-id-123',
        });

        // No skill identity leaks into the output ref under any property.
        const refA = outputA.metadata.codeEnvRef;
        const refB = outputB.metadata.codeEnvRef;
        expect(refA.kind).not.toBe('skill');
        expect(refB.kind).not.toBe('skill');
        expect(refA).not.toHaveProperty('version');
        expect(refB).not.toHaveProperty('version');
      });

      it('should set correct context for code-generated files', async () => {
        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });

        const { file: result } = await processCodeOutput(baseParams);

        expect(result.context).toBe(FileContext.execute_code);
      });

      it('should include toolCallId and messageId in result', async () => {
        const smallBuffer = Buffer.alloc(100);
        mockAxios.mockResolvedValue({ data: smallBuffer });

        const { file: result } = await processCodeOutput(baseParams);

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

        const { file: result } = await processCodeOutput({
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

        await getSessionInfo({
          kind: 'user',
          id: 'user-1',
          storage_session_id: 'sess',
          file_id: 'fid',
        });

        const callConfig = mockAxios.mock.calls[0][0];
        expect(callConfig.httpAgent).toBe(codeServerHttpAgent);
        expect(callConfig.httpsAgent).toBe(codeServerHttpsAgent);
        expect(callConfig.httpAgent.keepAlive).toBe(false);
        expect(callConfig.httpsAgent.keepAlive).toBe(false);
      });
    });

    describe('deferred-preview flow (office-bucket files)', () => {
      /* Office-bucket files (DOCX/XLSX/etc.) split into:
       *   the initial emit (await): persist `text: null, status: 'pending'`,
       *     return `{ file, finalize }` so the caller can ship the
       *     attachment to the client immediately;
       *   the deferred render (background): finalize() invokes the extractor and
       *     transitions the record to 'ready' (with text/textFormat) or
       *     'failed' (with previewError). The agent's final response
       *     never blocks on the deferred render.
       *
       * The `hasOfficeHtmlPath` mock is the gate. Other tests keep it
       * at `false` (legacy single-phase path); we flip it on here. */
      const { updateFile } = require('~/models');

      beforeEach(() => {
        mockHasOfficeHtmlPath.mockReturnValue(true);
        updateFile.mockResolvedValue({ file_id: 'mock-uuid-1234', status: 'ready' });
      });

      afterEach(() => {
        mockHasOfficeHtmlPath.mockReturnValue(false);
      });

      it('persists the initial emit with status:pending and text:null, deferring extraction', async () => {
        mockAxios.mockResolvedValue({ data: Buffer.alloc(100) });
        determineFileType.mockResolvedValue({
          mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

        const result = await processCodeOutput({ ...baseParams, name: 'data.xlsx' });

        expect(result.file).toMatchObject({
          file_id: 'mock-uuid-1234',
          filename: 'data.xlsx',
          status: 'pending',
          text: null,
          textFormat: null,
        });
        expect(typeof result.finalize).toBe('function');
        // Extractor MUST NOT have been called yet — that's deferred preview work.
        expect(mockExtractCodeArtifactText).not.toHaveBeenCalled();
        // Persisted record with the pending status.
        expect(createFile).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'pending', text: null, textFormat: null }),
          true,
        );
      });

      it('finalize() runs the extractor, transitions to ready with text+textFormat on success', async () => {
        mockAxios.mockResolvedValue({ data: Buffer.alloc(100) });
        determineFileType.mockResolvedValue({
          mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        mockExtractCodeArtifactText.mockResolvedValueOnce('<table><tr><td>1</td></tr></table>');
        mockGetExtractedTextFormat.mockReturnValueOnce('html');

        const { finalize } = await processCodeOutput({ ...baseParams, name: 'data.xlsx' });
        await finalize();

        expect(mockExtractCodeArtifactText).toHaveBeenCalledTimes(1);
        /* Update is conditional on `previewRevision` so an older render
         * can't overwrite a newer turn's record on cross-turn filename
         * reuse. The uuid mock returns the same value for every v4()
         * call, so file_id and previewRevision happen to coincide here
         * — what matters is the second arg carries the revision filter. */
        expect(updateFile).toHaveBeenCalledWith(
          {
            file_id: 'mock-uuid-1234',
            text: '<table><tr><td>1</td></tr></table>',
            textFormat: 'html',
            status: 'ready',
            previewError: null,
          },
          { previewRevision: 'mock-uuid-1234' },
        );
      });

      it('finalize() transitions to failed with previewError when extractor returns null (HTML-or-null contract)', async () => {
        mockAxios.mockResolvedValue({ data: Buffer.alloc(100) });
        determineFileType.mockResolvedValue({
          mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        mockExtractCodeArtifactText.mockResolvedValueOnce(null);
        // Office bucket + null text → must be 'failed', NEVER raw text fallback
        // (PR #12934 SEC fix: prevents <script> in cell text from rendering as HTML).
        mockHasOfficeHtmlPath.mockReturnValue(true);

        const { finalize } = await processCodeOutput({ ...baseParams, name: 'data.xlsx' });
        await finalize();

        expect(updateFile).toHaveBeenCalledWith(
          expect.objectContaining({
            file_id: 'mock-uuid-1234',
            text: null,
            status: 'failed',
            previewError: 'parser-error',
          }),
          { previewRevision: 'mock-uuid-1234' },
        );
      });

      it('finalize() transitions to failed with previewError:timeout when the outer timeout rejects', async () => {
        /* The passthrough `withTimeout` mock at the file scope returns
         * its inner promise unchanged, so the only way the catch branch
         * fires here is if the extractor itself throws. The real
         * production path: `extractCodeArtifactText` swallows its own
         * errors and returns null, so any throw reaching `finalizePreview`
         * came from the outer `withTimeout` rejection. Simulate it by
         * having the extractor throw with the same shape. */
        mockAxios.mockResolvedValue({ data: Buffer.alloc(100) });
        determineFileType.mockResolvedValue({
          mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        mockExtractCodeArtifactText.mockImplementationOnce(async () => {
          throw new Error('Preview extraction exceeded 60000ms');
        });

        const { finalize } = await processCodeOutput({ ...baseParams, name: 'data.xlsx' });
        await finalize();

        expect(updateFile).toHaveBeenCalledWith(
          expect.objectContaining({
            file_id: 'mock-uuid-1234',
            status: 'failed',
            previewError: 'timeout',
          }),
          { previewRevision: 'mock-uuid-1234' },
        );
      });

      it('survives a failing updateFile in finalize() without throwing', async () => {
        mockAxios.mockResolvedValue({ data: Buffer.alloc(100) });
        determineFileType.mockResolvedValue({
          mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        mockExtractCodeArtifactText.mockResolvedValueOnce('<table></table>');
        mockGetExtractedTextFormat.mockReturnValueOnce('html');
        updateFile.mockRejectedValueOnce(new Error('mongo down'));

        const { finalize } = await processCodeOutput({ ...baseParams, name: 'data.xlsx' });
        await expect(finalize()).resolves.toBeNull();
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('failed to persist preview result'),
        );
      });
    });

    describe('legacy single-phase flow (non-office files)', () => {
      /* Lock in that non-office files (txt/json/pdf/binary) keep the
       * inline extract+create flow with NO finalize key — the caller
       * gets a fully-resolved record, no background work to run. */
      it('returns no finalize key for plain text', async () => {
        mockAxios.mockResolvedValue({ data: Buffer.alloc(100) });
        const result = await processCodeOutput({ ...baseParams, name: 'note.txt' });
        expect(result.finalize).toBeUndefined();
        expect(result.file).toMatchObject({ filename: 'note.txt' });
      });

      it('returns no finalize key for the size-limit fallback', async () => {
        mockAxios.mockResolvedValue({ data: Buffer.alloc(100 * 1024 * 1024) });
        const result = await processCodeOutput(baseParams);
        expect(result.finalize).toBeUndefined();
        expect(result.file.filepath).toContain('/api/files/code/download/');
      });

      it('returns no finalize key for the saveBuffer-unavailable fallback', async () => {
        getStrategyFunctions.mockReturnValueOnce({});
        mockAxios.mockResolvedValue({ data: Buffer.alloc(100) });
        const result = await processCodeOutput(baseParams);
        expect(result.finalize).toBeUndefined();
        expect(result.file.filepath).toContain('/api/files/code/download/');
      });

      it('returns no finalize key for the axios-error fallback', async () => {
        mockAxios.mockRejectedValue(new Error('network'));
        const result = await processCodeOutput(baseParams);
        expect(result.finalize).toBeUndefined();
        expect(result.file.filepath).toContain('/api/files/code/download/');
      });
    });
  });

  describe('runPreviewFinalize', () => {
    /* The runtime pairing for `processCodeOutput`'s `finalize` thunk.
     * `finalizePreview` is designed to never throw (translates errors
     * to `status: 'failed'` internally). The helper's catch is the
     * safety net for unexpected programming errors that would
     * otherwise leave the DB record stuck at `status: 'pending'`
     * forever — we attempt a best-effort `updateFile` to mark it
     * `'failed'` with `previewError: 'unexpected'` so the UI stops
     * polling and the next-turn LLM context surfaces the failure.
     * (Codex audit on PR #12957 Finding 4.) */
    const { runPreviewFinalize } = require('./process');
    const { updateFile } = require('~/models');

    beforeEach(() => {
      updateFile.mockReset();
      updateFile.mockResolvedValue({});
    });

    it('is a no-op when finalize is undefined (non-office files)', () => {
      expect(() =>
        runPreviewFinalize({ finalize: undefined, fileId: 'fid-1', onResolved: jest.fn() }),
      ).not.toThrow();
      expect(updateFile).not.toHaveBeenCalled();
    });

    it('calls onResolved with the resolved record on success', async () => {
      const onResolved = jest.fn();
      const finalize = jest
        .fn()
        .mockResolvedValue({ file_id: 'fid-1', status: 'ready', text: '<x/>' });
      runPreviewFinalize({ finalize, fileId: 'fid-1', onResolved });
      await new Promise((resolve) => setImmediate(resolve));
      expect(onResolved).toHaveBeenCalledWith(
        expect.objectContaining({ file_id: 'fid-1', status: 'ready' }),
      );
      expect(updateFile).not.toHaveBeenCalled();
    });

    it('skips onResolved when finalize resolves to null (DB write failed inside finalizePreview)', async () => {
      const onResolved = jest.fn();
      const finalize = jest.fn().mockResolvedValue(null);
      runPreviewFinalize({ finalize, fileId: 'fid-1', onResolved });
      await new Promise((resolve) => setImmediate(resolve));
      expect(onResolved).not.toHaveBeenCalled();
    });

    it('marks the record as failed (previewError: "unexpected") when finalize throws', async () => {
      const onResolved = jest.fn();
      const finalize = jest.fn().mockRejectedValue(new Error('unexpected ref error'));
      runPreviewFinalize({
        finalize,
        fileId: 'fid-boom',
        previewRevision: 'rev-A',
        onResolved,
      });
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      expect(onResolved).not.toHaveBeenCalled();
      /* Defensive update is conditional on the same `previewRevision`
       * the deferred render started with — a newer turn that has
       * since rotated the revision is left untouched. */
      expect(updateFile).toHaveBeenCalledWith(
        {
          file_id: 'fid-boom',
          status: 'failed',
          previewError: 'unexpected',
        },
        { previewRevision: 'rev-A' },
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error rendering deferred preview:',
        expect.any(Error),
      );
    });

    it('logs but does not throw when the defensive updateFile itself fails', async () => {
      const onResolved = jest.fn();
      const finalize = jest.fn().mockRejectedValue(new Error('original error'));
      updateFile.mockRejectedValueOnce(new Error('mongo down'));
      runPreviewFinalize({ finalize, fileId: 'fid-doublefail', onResolved });
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      expect(onResolved).not.toHaveBeenCalled();
      // Two logger.error calls: one for the original throw, one for the failed mark.
      expect(logger.error.mock.calls.some((c) => /also failed to mark/.test(c[0]))).toBe(true);
    });

    it('does not attempt the defensive updateFile when fileId is missing', async () => {
      const finalize = jest.fn().mockRejectedValue(new Error('boom'));
      runPreviewFinalize({ finalize, fileId: undefined });
      await new Promise((resolve) => setImmediate(resolve));
      expect(updateFile).not.toHaveBeenCalled();
    });

    it('skips onResolved gracefully when caller omits it (e.g., tools.js direct endpoint)', async () => {
      const finalize = jest.fn().mockResolvedValue({ file_id: 'fid-1', status: 'ready' });
      // No onResolved — non-streaming caller.
      expect(() => runPreviewFinalize({ finalize, fileId: 'fid-1' })).not.toThrow();
      await new Promise((resolve) => setImmediate(resolve));
      expect(updateFile).not.toHaveBeenCalled();
    });

    it('does NOT downgrade the file to failed when finalize succeeds but onResolved throws', async () => {
      /* Regression for the codex P2 finding: the original chain put the
       * `.catch` after `.then(onResolved)`, so a throw inside
       * `onResolved` (transport-side: SSE write race after stream
       * close, an emitter listener throwing) propagated into the
       * finalize catch and persisted `status: 'failed'` /
       * `previewError: 'unexpected'` — even though extraction
       * succeeded and the file was already on disk and marked ready.
       * That surfaced "preview unavailable" in the UI for a perfectly
       * valid file, and degraded next-turn LLM context. The fix wraps
       * `onResolved` in its own try/catch so emit errors stay isolated
       * from finalize errors. */
      const onResolved = jest.fn(() => {
        throw new Error('SSE write after stream closed');
      });
      const finalize = jest.fn().mockResolvedValue({
        file_id: 'fid-emit-throw',
        status: 'ready',
        text: '<table>x</table>',
      });
      runPreviewFinalize({
        finalize,
        fileId: 'fid-emit-throw',
        previewRevision: 'rev-A',
        onResolved,
      });
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      expect(onResolved).toHaveBeenCalledTimes(1);
      /* The defensive "mark failed" path MUST NOT fire — the file is
       * resolved and on disk; only the SSE emit failed. */
      expect(updateFile).not.toHaveBeenCalled();
      /* Emit error is logged so the failure is observable in the
       * server log without affecting UX. */
      expect(
        logger.error.mock.calls.some((c) => /onResolved threw for fid-emit-throw/.test(c[0])),
      ).toBe(true);
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

  describe('primeFiles reupload pushes FRESH sandbox ids (Pass-N review P2)', () => {
    /**
     * Regression: when a primed code file is missing/expired in the
     * sandbox (`getSessionInfo` returns null), `primeFiles` re-uploads
     * the file via `handleFileUpload` and persists the new
     * `fileIdentifier`. Before the fix, the in-memory `files[]` array
     * (now consumed by `buildInitialToolSessions` to seed
     * `Graph.sessions`) still received the STALE `(session_id, id)`
     * parsed from the original `fileIdentifier` at the top of the
     * loop. The DB record was correct but the seed referenced a
     * sandbox object that no longer existed — the first tool call
     * 404'd trying to mount it until the next turn re-read metadata.
     *
     * Fix: parse the FRESH `fileIdentifier` returned by upload and
     * push those ids into both the dedupe Map and the seed list.
     */

    const { getStrategyFunctions } = require('~/server/services/Files/strategies');
    const { updateFile, getFiles } = require('~/models');
    const { filterFilesByAgentAccess } = require('~/server/services/Files/permissions');

    /**
     * Mock the full strategy pair. `primeFiles` calls
     * `getStrategyFunctions(file.source)` for the download stream and
     * `getStrategyFunctions(FileSources.execute_code)` for the code-env
     * upload — both go through the same factory in production.
     */
    function setupReuploadMocks(newRef) {
      const handleFileUpload = jest.fn().mockResolvedValue(newRef);
      const getDownloadStream = jest.fn().mockResolvedValue('mock-stream');
      getStrategyFunctions.mockImplementation((source) => {
        if (source === 'execute_code') return { handleFileUpload };
        return { getDownloadStream };
      });
      updateFile.mockResolvedValue({});
      filterFilesByAgentAccess.mockImplementation(({ files }) => Promise.resolve(files));
      // getSessionInfo is mocked at module level via mockAxios; return null
      // to force the reupload path. Each `getSessionInfo` call hits axios.
      mockAxios.mockResolvedValue({ data: null });
      return { handleFileUpload, getDownloadStream };
    }

    it('seed receives FRESH (storage_session_id, file_id) from the reupload response', async () => {
      const dbFile = {
        file_id: 'librechat-file-id',
        filename: 'sentinel.txt',
        filepath: '/uploads/sentinel.txt',
        source: 'local',
        context: 'execute_code',
        metadata: {
          /* Stale sandbox ref — this is what `getSessionInfo` will 404 on. */
          codeEnvRef: {
            kind: 'user',
            id: 'user-123',
            storage_session_id: 'OLD_SESSION',
            file_id: 'OLD_ID',
          },
        },
      };
      getFiles.mockResolvedValue([dbFile]);

      setupReuploadMocks({ storage_session_id: 'NEW_SESSION', file_id: 'NEW_ID' });

      const result = await primeFiles({
        req: { user: { id: 'user-123', role: 'USER' } },
        tool_resources: {
          execute_code: { file_ids: ['librechat-file-id'], files: [] },
        },
        agentId: 'agent-id',
      });

      // The seed list (consumed by buildInitialToolSessions) MUST carry
      // the post-reupload ids — not the stale pre-reupload ones.
      expect(result.files).toEqual([
        {
          id: 'NEW_ID',
          /* `resource_id` carries the codeEnvRef.id (= original
           * userId for kind: 'user'), threaded onto the in-memory
           * file ref for codeapi's sessionKey re-derivation. */
          resource_id: 'user-123',
          storage_session_id: 'NEW_SESSION',
          name: 'sentinel.txt',
          kind: 'user',
        },
      ]);
    });

    /* Phase C / option α (codeapi #1455): reupload preserves the
     * resource identity from the existing ref so codeapi re-buckets
     * under the same sessionKey shape. Without this, a skill-cache-miss
     * reupload lands in the user bucket and is no longer cross-user
     * shareable. */
    it('reupload forwards kind/id (and version when skill) from the existing ref', async () => {
      const dbFile = {
        file_id: 'librechat-file-id',
        filename: 'sentinel.txt',
        filepath: '/uploads/sentinel.txt',
        source: 'local',
        context: 'execute_code',
        metadata: {
          codeEnvRef: {
            kind: 'skill',
            id: 'skill-99',
            storage_session_id: 'OLD_SESSION',
            file_id: 'OLD_ID',
            version: 4,
          },
        },
      };
      getFiles.mockResolvedValue([dbFile]);

      const { handleFileUpload } = setupReuploadMocks({
        storage_session_id: 'NEW_SESSION',
        file_id: 'NEW_ID',
      });

      await primeFiles({
        req: { user: { id: 'user-123', role: 'USER' } },
        tool_resources: {
          execute_code: { file_ids: ['librechat-file-id'], files: [] },
        },
        agentId: 'agent-id',
      });

      expect(handleFileUpload).toHaveBeenCalledTimes(1);
      const uploadArgs = handleFileUpload.mock.calls[0][0];
      expect(uploadArgs.kind).toBe('skill');
      expect(uploadArgs.id).toBe('skill-99');
      expect(uploadArgs.version).toBe(4);
    });

    it('persists fresh codeEnvRef (kind/id preserved) on the DB record after reupload', async () => {
      const dbFile = {
        file_id: 'librechat-file-id',
        filename: 'sentinel.txt',
        filepath: '/uploads/sentinel.txt',
        source: 'local',
        context: 'execute_code',
        metadata: {
          codeEnvRef: {
            kind: 'user',
            id: 'user-123',
            storage_session_id: 'OLD_SESSION',
            file_id: 'OLD_ID',
          },
        },
      };
      getFiles.mockResolvedValue([dbFile]);

      setupReuploadMocks({ storage_session_id: 'NEW_SESSION', file_id: 'NEW_ID' });

      await primeFiles({
        req: { user: { id: 'user-123', role: 'USER' } },
        tool_resources: {
          execute_code: { file_ids: ['librechat-file-id'], files: [] },
        },
        agentId: 'agent-id',
      });

      expect(updateFile).toHaveBeenCalledWith(
        expect.objectContaining({
          file_id: 'librechat-file-id',
          metadata: expect.objectContaining({
            codeEnvRef: {
              kind: 'user',
              id: 'user-123',
              storage_session_id: 'NEW_SESSION',
              file_id: 'NEW_ID',
            },
          }),
        }),
      );
    });

    it('reads codeEnvRef directly when present (skipping reupload)', async () => {
      const dbFile = {
        file_id: 'librechat-file-id',
        filename: 'sentinel.txt',
        filepath: '/uploads/sentinel.txt',
        source: 'local',
        context: 'execute_code',
        metadata: {
          codeEnvRef: {
            kind: 'user',
            id: 'user-123',
            storage_session_id: 'STRUCT_SESSION',
            file_id: 'STRUCT_ID',
          },
        },
      };
      getFiles.mockResolvedValue([dbFile]);
      filterFilesByAgentAccess.mockImplementation(({ files }) => Promise.resolve(files));
      // getSessionInfo returns a fresh timestamp so reupload is skipped.
      mockAxios.mockResolvedValue({ data: { lastModified: new Date().toISOString() } });

      const result = await primeFiles({
        req: { user: { id: 'user-123', role: 'USER' } },
        tool_resources: {
          execute_code: { file_ids: ['librechat-file-id'], files: [] },
        },
        agentId: 'agent-id',
      });

      expect(updateFile).not.toHaveBeenCalled();
      expect(result.files).toEqual([
        {
          id: 'STRUCT_ID',
          /* `resource_id` from the persisted codeEnvRef.id — for
           * `kind: 'user'` this is informational (codeapi derives
           * sessionKey from auth context) but threaded for shape
           * uniformity with shared kinds. */
          resource_id: 'user-123',
          storage_session_id: 'STRUCT_SESSION',
          name: 'sentinel.txt',
          kind: 'user',
        },
      ]);
    });
  });

  describe('primeFiles toolContext surfaces preview status to the LLM', () => {
    /* When a prior-turn code-execution file's HTML preview never resolved
     * (still pending, or failed), the agent context for this turn must
     * carry that signal so the model can tell the user "you can still
     * download it, but the preview isn't available." Otherwise the model
     * would refer to the file as if everything is fine and the user gets
     * a confusing UI mismatch. */

    const { getStrategyFunctions } = require('~/server/services/Files/strategies');
    const { getFiles } = require('~/models');
    const { filterFilesByAgentAccess } = require('~/server/services/Files/permissions');

    function makeFile(overrides) {
      return {
        file_id: `fid-${overrides.status ?? 'ready'}`,
        filename: `data-${overrides.status ?? 'ready'}.xlsx`,
        filepath: `/uploads/${overrides.status ?? 'ready'}.xlsx`,
        source: 'local',
        context: 'execute_code',
        metadata: {
          codeEnvRef: {
            kind: 'user',
            id: 'user-123',
            storage_session_id: 'CURRENT_SESSION',
            file_id: 'CURRENT_ID',
          },
        },
        ...overrides,
      };
    }

    function setupSessionInfoOk() {
      /* `getSessionInfo` returns `lastModified`; `checkIfActive` parses
       * that as a Date and decides whether the sandbox copy is still
       * fresh (under 23 hours). Use `now` so we always go straight to
       * `pushFile` and exercise the toolContext annotation logic. */
      mockAxios.mockResolvedValue({ data: { lastModified: new Date().toISOString() } });
      getStrategyFunctions.mockReturnValue({});
      filterFilesByAgentAccess.mockImplementation(({ files }) => Promise.resolve(files));
    }

    it('annotates a pending file with "(preview not yet generated)"', async () => {
      setupSessionInfoOk();
      getFiles.mockResolvedValue([makeFile({ status: 'pending' })]);
      const result = await primeFiles({
        req: { user: { id: 'user-123', role: 'USER' } },
        tool_resources: { execute_code: { file_ids: ['fid-pending'], files: [] } },
        agentId: 'agent-id',
      });
      expect(result.toolContext).toContain('data-pending.xlsx');
      expect(result.toolContext).toContain('(preview not yet generated)');
    });

    it('annotates a failed file with "(preview unavailable: <reason>)"', async () => {
      setupSessionInfoOk();
      getFiles.mockResolvedValue([makeFile({ status: 'failed', previewError: 'timeout' })]);
      const result = await primeFiles({
        req: { user: { id: 'user-123', role: 'USER' } },
        tool_resources: { execute_code: { file_ids: ['fid-failed'], files: [] } },
        agentId: 'agent-id',
      });
      expect(result.toolContext).toContain('data-failed.xlsx');
      expect(result.toolContext).toContain('(preview unavailable: timeout)');
    });

    it('falls back to bare "(preview unavailable)" when previewError is absent', async () => {
      setupSessionInfoOk();
      getFiles.mockResolvedValue([makeFile({ status: 'failed' })]);
      const result = await primeFiles({
        req: { user: { id: 'user-123', role: 'USER' } },
        tool_resources: { execute_code: { file_ids: ['fid-failed'], files: [] } },
        agentId: 'agent-id',
      });
      expect(result.toolContext).toContain('(preview unavailable)');
      expect(result.toolContext).not.toContain('(preview unavailable:');
    });

    it('does not annotate a ready file (no extra suffix)', async () => {
      setupSessionInfoOk();
      getFiles.mockResolvedValue([makeFile({ status: 'ready' })]);
      const result = await primeFiles({
        req: { user: { id: 'user-123', role: 'USER' } },
        tool_resources: { execute_code: { file_ids: ['fid-ready'], files: [] } },
        agentId: 'agent-id',
      });
      expect(result.toolContext).toContain('data-ready.xlsx');
      expect(result.toolContext).not.toContain('preview');
    });

    it('does not annotate a legacy file (no status field, back-compat)', async () => {
      /* Records pre-dating the deferred-preview flow have no `status`. They
       * MUST render exactly as before — no suffix at all. */
      setupSessionInfoOk();
      getFiles.mockResolvedValue([makeFile({})]); // no status override
      const result = await primeFiles({
        req: { user: { id: 'user-123', role: 'USER' } },
        tool_resources: { execute_code: { file_ids: ['fid-ready'], files: [] } },
        agentId: 'agent-id',
      });
      expect(result.toolContext).toContain('data-ready.xlsx');
      expect(result.toolContext).not.toContain('preview');
    });
  });
});
