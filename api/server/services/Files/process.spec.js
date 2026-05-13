jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid') }));

jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn(), info: jest.fn() },
  runAsSystem: jest.fn((fn) => fn()),
  createTempChatExpirationDate: jest.fn(() => new Date('2030-01-01T00:00:00.000Z')),
}));

jest.mock('@librechat/agents', () => ({
  Providers: {
    XAI: 'xai',
    DEEPSEEK: 'deepseek',
    MOONSHOT: 'moonshot',
    OPENROUTER: 'openrouter',
    VERTEXAI: 'vertexai',
  },
}));

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    Providers: actual.Providers,
    mergeFileConfig: jest.fn(),
  };
});

jest.mock('@librechat/api', () => {
  const { FileSources, EModelEndpoint, checkOpenAIStorage, defaultAssistantsVersion } =
    jest.requireActual('librechat-data-provider');
  const defaultSweepInterval = 60 * 60 * 1000;

  const getSweepInterval = () => {
    const interval = process.env.FILE_RETENTION_SWEEP_INTERVAL_MS;
    if (interval == null || interval.trim() === '') {
      return defaultSweepInterval;
    }
    const value = Number(interval);
    return !Number.isFinite(value) || value < 0 || (value > 0 && value < 1)
      ? defaultSweepInterval
      : value;
  };

  const getExpiredFileEndpoint = (source) =>
    source === FileSources.azure ? EModelEndpoint.azureAssistants : EModelEndpoint.assistants;

  const hasEndpointConfig = (appConfig, source) =>
    source === FileSources.azure
      ? Boolean(appConfig?.endpoints?.[EModelEndpoint.azureOpenAI]?.assistants)
      : Boolean(appConfig?.endpoints?.[EModelEndpoint.assistants]);

  const getAssistantVersion = ({ appConfig, source, endpoint }) => {
    const endpointVersion = appConfig?.endpoints?.[endpoint]?.version;
    if (endpointVersion != null) {
      return String(endpointVersion).replace(/^v/, '');
    }
    if (source === FileSources.azure) {
      const azureAssistantsConfig = appConfig?.endpoints?.[EModelEndpoint.azureOpenAI]?.assistants;
      if (typeof azureAssistantsConfig === 'object' && azureAssistantsConfig?.version != null) {
        return String(azureAssistantsConfig.version).replace(/^v/, '');
      }
    }
    return String(
      defaultAssistantsVersion[endpoint] ?? defaultAssistantsVersion.assistants ?? 2,
    ).replace(/^v/, '');
  };

  const createSweepReq = ({ appConfig, file, userId }) => {
    const source = file.source ?? FileSources.local;
    const endpoint = getExpiredFileEndpoint(source);
    const version = getAssistantVersion({ appConfig, source, endpoint });
    const baseUrl = `/api/assistants/v${version}`;
    return {
      baseUrl,
      originalUrl: `${baseUrl}/files`,
      path: '/files',
      method: 'DELETE',
      headers: {},
      query: {},
      params: {},
      config: appConfig,
      body: { endpoint, version },
      user: { id: userId, tenantId: file.tenantId },
    };
  };

  const sweepExpiredFiles = async (
    { appConfig, limit = 100, loadAppConfig } = {},
    { getExpiredFiles, processDeleteRequest, logger },
  ) => {
    const files = (await getExpiredFiles(limit)) ?? [];
    let resolvedAppConfig = appConfig;
    let deleted = 0;
    let failed = 0;

    for (const file of files) {
      const userId = file.user?.toString?.() ?? file.user;
      if (!userId) {
        logger.warn(`[sweepExpiredFiles] Skipping expired file without user: ${file.file_id}`);
        failed++;
        continue;
      }

      try {
        const source = file.source ?? FileSources.local;
        if (
          checkOpenAIStorage(source) &&
          !hasEndpointConfig(resolvedAppConfig, source) &&
          typeof loadAppConfig === 'function'
        ) {
          resolvedAppConfig = (await loadAppConfig()) ?? resolvedAppConfig;
        }
        const req = createSweepReq({ appConfig: resolvedAppConfig, file, userId });
        const { deletedFileIds, failedFileIds } = await processDeleteRequest({
          req,
          files: [file],
        });
        if (failedFileIds.includes(file.file_id)) {
          failed++;
        } else if (deletedFileIds.includes(file.file_id)) {
          deleted++;
        } else {
          failed++;
          logger.error(
            `[sweepExpiredFiles] Delete request finished without resolving expired file ${file.file_id}`,
          );
        }
      } catch (error) {
        failed++;
        logger.error(`[sweepExpiredFiles] Error deleting expired file ${file.file_id}:`, error);
      }
    }

    if (deleted > 0 || failed > 0) {
      logger.info(
        `[sweepExpiredFiles] Processed ${files.length} expired files: ${deleted} deleted, ${failed} failed`,
      );
    }

    return { scanned: files.length, deleted, failed };
  };

  const startExpiredFileSweep = (options = {}, { sweepExpiredFiles, runAsSystem, logger }) => {
    const intervalMs = getSweepInterval();
    if (intervalMs === 0) {
      logger.info('[sweepExpiredFiles] Disabled by FILE_RETENTION_SWEEP_INTERVAL_MS=0');
      return null;
    }

    let isSweeping = false;
    const runSweep = async () => {
      if (isSweeping) {
        return;
      }
      isSweeping = true;
      try {
        await runAsSystem(() => sweepExpiredFiles(options));
      } catch (error) {
        logger.error('[sweepExpiredFiles] Background sweep failed:', error);
      } finally {
        isSweeping = false;
      }
    };

    runSweep();
    const interval = setInterval(runSweep, intervalMs);
    interval.unref?.();
    return interval;
  };

  return {
    sanitizeFilename: jest.fn((n) => n),
    parseText: jest.fn().mockResolvedValue({ text: '', bytes: 0 }),
    processAudioFile: jest.fn(),
    getStorageMetadata: jest.fn(() => ({})),
    getRetentionExpiry: jest.fn(() => ({})),
    sweepExpiredFiles,
    startExpiredFileSweep,
  };
});

jest.mock('~/server/services/Files/images', () => ({
  convertImage: jest.fn(),
  resizeAndConvert: jest.fn(),
  resizeImageBuffer: jest.fn(),
}));

jest.mock('~/server/controllers/assistants/v2', () => ({
  addResourceFileId: jest.fn(),
  deleteResourceFileId: jest.fn(),
}));

jest.mock('~/server/controllers/assistants/helpers', () => ({
  getOpenAIClient: jest.fn(),
}));

jest.mock('~/server/services/Tools/credentials', () => ({
  loadAuthValues: jest.fn(),
}));

jest.mock('~/models', () => ({
  createFile: jest.fn().mockResolvedValue({ file_id: 'created-file-id' }),
  updateFileUsage: jest.fn(),
  deleteFiles: jest.fn(),
  findFileById: jest.fn(),
  getConvo: jest.fn(),
  getExpiredFiles: jest.fn(),
  addAgentResourceFile: jest.fn().mockResolvedValue({}),
  removeAgentResourceFiles: jest.fn(),
  removeAgentResourceFilesFromAllAgents: jest.fn(),
}));

jest.mock('~/server/utils/getFileStrategy', () => ({
  getFileStrategy: jest.fn().mockReturnValue('local'),
}));

jest.mock('~/server/services/Config', () => ({
  checkCapability: jest.fn().mockResolvedValue(true),
}));

jest.mock('~/server/utils/queue', () => ({
  LB_QueueAsyncCall: jest.fn(),
}));

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(),
}));

jest.mock('~/server/utils', () => ({
  determineFileType: jest.fn(),
}));

jest.mock('~/server/services/Files/Audio/STTService', () => ({
  STTService: { getInstance: jest.fn() },
}));

const { getRetentionExpiry } = require('@librechat/api');
const {
  EToolResources,
  FileSources,
  FileContext,
  EModelEndpoint,
  RetentionMode,
  AgentCapabilities,
} = require('librechat-data-provider');
const { mergeFileConfig } = require('librechat-data-provider');
const { getOpenAIClient } = require('~/server/controllers/assistants/helpers');
const { checkCapability } = require('~/server/services/Config');
const { LB_QueueAsyncCall } = require('~/server/utils/queue');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const db = require('~/models');
const {
  processAgentFileUpload,
  processFileURL,
  sweepExpiredFiles,
  startExpiredFileSweep,
} = require('./process');

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLS_MIME = 'application/vnd.ms-excel';
const ODS_MIME = 'application/vnd.oasis.opendocument.spreadsheet';
const ODT_MIME = 'application/vnd.oasis.opendocument.text';
const ODP_MIME = 'application/vnd.oasis.opendocument.presentation';
const ODG_MIME = 'application/vnd.oasis.opendocument.graphics';

const flushPromises = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
};

const makeReq = ({ mimetype = PDF_MIME, ocrConfig = null } = {}) => ({
  user: { id: 'user-123', tenantId: 'tenant-a' },
  file: {
    path: '/tmp/upload.bin',
    originalname: 'upload.bin',
    filename: 'upload-uuid.bin',
    mimetype,
  },
  body: { model: 'gpt-4o' },
  config: {
    fileConfig: {},
    fileStrategy: 'local',
    ocr: ocrConfig,
  },
});

const makeMetadata = () => ({
  agent_id: 'agent-abc',
  tool_resource: EToolResources.context,
  file_id: 'file-uuid-123',
});

const mockRes = {
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnValue({}),
};

const makeFileConfig = ({ ocrSupportedMimeTypes = [] } = {}) => ({
  checkType: (mime, types) => (types ?? []).includes(mime),
  ocr: { supportedMimeTypes: ocrSupportedMimeTypes },
  stt: { supportedMimeTypes: [] },
  text: { supportedMimeTypes: [] },
});

describe('processAgentFileUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRes.status.mockReturnThis();
    mockRes.json.mockReturnValue({});
    checkCapability.mockResolvedValue(true);
    getStrategyFunctions.mockReturnValue({
      handleFileUpload: jest
        .fn()
        .mockResolvedValue({ text: 'extracted text', bytes: 42, filepath: 'doc://result' }),
    });
    mergeFileConfig.mockReturnValue(makeFileConfig());
  });

  describe('OCR strategy selection', () => {
    test.each([
      ['PDF', PDF_MIME],
      ['DOCX', DOCX_MIME],
      ['XLSX', XLSX_MIME],
      ['XLS', XLS_MIME],
      ['ODS', ODS_MIME],
      ['Excel variant (msexcel)', 'application/msexcel'],
      ['Excel variant (x-msexcel)', 'application/x-msexcel'],
    ])('uses document_parser automatically for %s when no OCR is configured', async (_, mime) => {
      mergeFileConfig.mockReturnValue(makeFileConfig());
      const req = makeReq({ mimetype: mime, ocrConfig: null });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(getStrategyFunctions).toHaveBeenCalledWith(FileSources.document_parser);
    });

    test('does not check OCR capability when using automatic document_parser fallback', async () => {
      const req = makeReq({ mimetype: PDF_MIME, ocrConfig: null });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(checkCapability).not.toHaveBeenCalledWith(expect.anything(), AgentCapabilities.ocr);
      expect(getStrategyFunctions).toHaveBeenCalledWith(FileSources.document_parser);
    });

    test('uses the configured OCR strategy when OCR is set up for the file type', async () => {
      mergeFileConfig.mockReturnValue(makeFileConfig({ ocrSupportedMimeTypes: [PDF_MIME] }));
      const req = makeReq({
        mimetype: PDF_MIME,
        ocrConfig: { strategy: FileSources.mistral_ocr },
      });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(checkCapability).toHaveBeenCalledWith(expect.anything(), AgentCapabilities.ocr);
      expect(getStrategyFunctions).toHaveBeenCalledWith(FileSources.mistral_ocr);
    });

    test('uses document_parser as default when OCR is configured but no strategy is specified', async () => {
      mergeFileConfig.mockReturnValue(makeFileConfig({ ocrSupportedMimeTypes: [PDF_MIME] }));
      const req = makeReq({
        mimetype: PDF_MIME,
        ocrConfig: { supportedMimeTypes: [PDF_MIME] },
      });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(checkCapability).toHaveBeenCalledWith(expect.anything(), AgentCapabilities.ocr);
      expect(getStrategyFunctions).toHaveBeenCalledWith(FileSources.document_parser);
    });

    test('throws when configured OCR capability is not enabled for the agent', async () => {
      mergeFileConfig.mockReturnValue(makeFileConfig({ ocrSupportedMimeTypes: [PDF_MIME] }));
      checkCapability.mockResolvedValue(false);
      const req = makeReq({
        mimetype: PDF_MIME,
        ocrConfig: { strategy: FileSources.mistral_ocr },
      });

      await expect(
        processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() }),
      ).rejects.toThrow('OCR capability is not enabled for Agents');
    });

    test('uses document_parser (no capability check) when OCR capability returns false but no OCR config', async () => {
      checkCapability.mockResolvedValue(false);
      const req = makeReq({ mimetype: PDF_MIME, ocrConfig: null });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(checkCapability).not.toHaveBeenCalledWith(expect.anything(), AgentCapabilities.ocr);
      expect(getStrategyFunctions).toHaveBeenCalledWith(FileSources.document_parser);
    });

    test('uses document_parser when OCR is configured but the file type is not in OCR supported types', async () => {
      mergeFileConfig.mockReturnValue(makeFileConfig({ ocrSupportedMimeTypes: [PDF_MIME] }));
      const req = makeReq({
        mimetype: DOCX_MIME,
        ocrConfig: { strategy: FileSources.mistral_ocr },
      });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(checkCapability).not.toHaveBeenCalledWith(expect.anything(), AgentCapabilities.ocr);
      expect(getStrategyFunctions).toHaveBeenCalledWith(FileSources.document_parser);
      expect(getStrategyFunctions).not.toHaveBeenCalledWith(FileSources.mistral_ocr);
    });

    test('does not invoke any OCR strategy for unsupported MIME types without OCR config', async () => {
      const req = makeReq({ mimetype: 'text/plain', ocrConfig: null });

      await expect(
        processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() }),
      ).rejects.toThrow('File type text/plain is not supported for text parsing.');

      expect(getStrategyFunctions).not.toHaveBeenCalled();
    });

    test.each([
      ['ODT', ODT_MIME],
      ['ODP', ODP_MIME],
      ['ODG', ODG_MIME],
    ])('routes %s through configured OCR when OCR supports the type', async (_, mime) => {
      mergeFileConfig.mockReturnValue(makeFileConfig({ ocrSupportedMimeTypes: [mime] }));
      const req = makeReq({
        mimetype: mime,
        ocrConfig: { strategy: FileSources.mistral_ocr },
      });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(checkCapability).toHaveBeenCalledWith(expect.anything(), AgentCapabilities.ocr);
      expect(getStrategyFunctions).toHaveBeenCalledWith(FileSources.mistral_ocr);
    });

    test('throws instead of falling back to parseText when document_parser fails for a document MIME type', async () => {
      getStrategyFunctions.mockReturnValue({
        handleFileUpload: jest.fn().mockRejectedValue(new Error('No text found in document')),
      });
      const req = makeReq({ mimetype: PDF_MIME, ocrConfig: null });
      const { parseText } = require('@librechat/api');

      await expect(
        processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() }),
      ).rejects.toThrow(/image-based and requires an OCR service/);

      expect(parseText).not.toHaveBeenCalled();
    });

    test('falls back to document_parser when configured OCR fails for a document MIME type', async () => {
      mergeFileConfig.mockReturnValue(makeFileConfig({ ocrSupportedMimeTypes: [PDF_MIME] }));
      const failingUpload = jest.fn().mockRejectedValue(new Error('OCR API returned 500'));
      const fallbackUpload = jest
        .fn()
        .mockResolvedValue({ text: 'parsed text', bytes: 11, filepath: 'doc://result' });
      getStrategyFunctions
        .mockReturnValueOnce({ handleFileUpload: failingUpload })
        .mockReturnValueOnce({ handleFileUpload: fallbackUpload });
      const req = makeReq({
        mimetype: PDF_MIME,
        ocrConfig: { strategy: FileSources.mistral_ocr },
      });

      await expect(
        processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() }),
      ).resolves.not.toThrow();

      expect(getStrategyFunctions).toHaveBeenCalledWith(FileSources.mistral_ocr);
      expect(getStrategyFunctions).toHaveBeenCalledWith(FileSources.document_parser);
    });

    test('throws when both configured OCR and document_parser fallback fail', async () => {
      mergeFileConfig.mockReturnValue(makeFileConfig({ ocrSupportedMimeTypes: [PDF_MIME] }));
      getStrategyFunctions.mockReturnValue({
        handleFileUpload: jest.fn().mockRejectedValue(new Error('failure')),
      });
      const req = makeReq({
        mimetype: PDF_MIME,
        ocrConfig: { strategy: FileSources.mistral_ocr },
      });
      const { parseText } = require('@librechat/api');

      await expect(
        processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() }),
      ).rejects.toThrow(/image-based and requires an OCR service/);

      expect(parseText).not.toHaveBeenCalled();
    });
  });

  describe('text size guard', () => {
    test('throws before writing to MongoDB when extracted text exceeds 15MB', async () => {
      const oversizedText = 'x'.repeat(15 * 1024 * 1024 + 1);
      getStrategyFunctions.mockReturnValue({
        handleFileUpload: jest.fn().mockResolvedValue({
          text: oversizedText,
          bytes: Buffer.byteLength(oversizedText, 'utf8'),
          filepath: 'doc://result',
        }),
      });
      const req = makeReq({ mimetype: PDF_MIME, ocrConfig: null });
      const { createFile } = require('~/models');

      await expect(
        processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() }),
      ).rejects.toThrow(/exceeds the 15MB storage limit/);

      expect(createFile).not.toHaveBeenCalled();
    });

    test('succeeds when extracted text is within the 15MB limit', async () => {
      const okText = 'x'.repeat(1024);
      getStrategyFunctions.mockReturnValue({
        handleFileUpload: jest.fn().mockResolvedValue({
          text: okText,
          bytes: Buffer.byteLength(okText, 'utf8'),
          filepath: 'doc://result',
        }),
      });
      const req = makeReq({ mimetype: PDF_MIME, ocrConfig: null });

      await expect(
        processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() }),
      ).resolves.not.toThrow();
    });
  });

  /* Phase C / option α regression: the upload must persist its sandbox
   * pointer under `metadata.codeEnvRef` (the post-cutover schema). The
   * legacy `metadata.fileIdentifier` key is silently stripped by mongoose
   * strict mode and downstream readers (`primeFiles`, `getCodeFilesByIds`,
   * `categorizeFileForToolResources`, controller filtering) only check
   * `codeEnvRef`. Storing under the legacy key would orphan the file —
   * priming would skip it on subsequent code-execution turns and the
   * sandbox copy would never re-mount. */
  describe('execute_code uploads persist codeEnvRef metadata', () => {
    const fs = require('fs');
    const { Readable } = require('stream');
    let createReadStreamSpy;

    beforeEach(() => {
      /* `processAgentFileUpload` opens the multer-staged temp file via
       * `fs.createReadStream`. The test fixture path doesn't exist, so
       * stub it to a tiny in-memory stream. */
      createReadStreamSpy = jest
        .spyOn(fs, 'createReadStream')
        .mockImplementation(() => Readable.from(Buffer.from('')));
    });

    afterEach(() => {
      createReadStreamSpy.mockRestore();
    });

    const setupCodeEnvUpload = (uploaded) => {
      /* `processAgentFileUpload` calls `getStrategyFunctions` twice:
       * once with `execute_code` for the codeapi upload, then again with
       * the on-disk strategy (`local`) for the standard storage step that
       * runs in the same flow. Both must return a working
       * `handleFileUpload`. */
      const codeEnvUpload = jest.fn().mockResolvedValue(uploaded);
      const localUpload = jest.fn().mockResolvedValue({
        bytes: 0,
        filename: 'upload.bin',
        filepath: '/uploads/upload.bin',
      });
      getStrategyFunctions.mockImplementation((src) =>
        src === FileSources.execute_code
          ? { handleFileUpload: codeEnvUpload }
          : { handleFileUpload: localUpload, saveBuffer: jest.fn() },
      );
      return codeEnvUpload;
    };

    it('persists kind:user codeEnvRef for chat attachments (messageAttachment=true)', async () => {
      setupCodeEnvUpload({ storage_session_id: 'sess-1', file_id: 'fid-1' });
      const req = makeReq();
      await processAgentFileUpload({
        req,
        res: mockRes,
        metadata: {
          agent_id: 'agent-abc',
          tool_resource: EToolResources.execute_code,
          file_id: 'file-uuid',
          message_file: true,
        },
      });

      expect(db.createFile).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            codeEnvRef: {
              kind: 'user',
              id: 'user-123',
              storage_session_id: 'sess-1',
              file_id: 'fid-1',
            },
          },
        }),
        true,
      );
    });

    it('persists kind:agent codeEnvRef for agent setup files (messageAttachment=false)', async () => {
      setupCodeEnvUpload({ storage_session_id: 'sess-2', file_id: 'fid-2' });
      const req = makeReq();
      await processAgentFileUpload({
        req,
        res: mockRes,
        metadata: {
          agent_id: 'agent-abc',
          tool_resource: EToolResources.execute_code,
          file_id: 'file-uuid',
        },
      });

      expect(db.createFile).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            codeEnvRef: {
              kind: 'agent',
              id: 'agent-abc',
              storage_session_id: 'sess-2',
              file_id: 'fid-2',
            },
          },
        }),
        true,
      );
    });

    it('does not persist legacy fileIdentifier key (mongoose strict drops it)', async () => {
      setupCodeEnvUpload({ storage_session_id: 'sess-3', file_id: 'fid-3' });
      const req = makeReq();
      await processAgentFileUpload({
        req,
        res: mockRes,
        metadata: {
          agent_id: 'agent-abc',
          tool_resource: EToolResources.execute_code,
          file_id: 'file-uuid',
          message_file: true,
        },
      });

      const persisted = db.createFile.mock.calls[0][0];
      expect(persisted.metadata).not.toHaveProperty('fileIdentifier');
    });
  });
});

describe('processFileURL', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws and skips DB persistence when saveURL returns null', async () => {
    const saveURL = jest.fn().mockResolvedValue(null);
    const getFileURL = jest.fn();
    getStrategyFunctions.mockReturnValue({ saveURL, getFileURL });

    await expect(
      processFileURL({
        fileStrategy: FileSources.local,
        userId: 'user-123',
        URL: 'https://example.com/image.png',
        fileName: 'image.png',
        basePath: 'images',
        context: FileContext.image_generation,
        tenantId: 'tenant-a',
      }),
    ).rejects.toThrow('Strategy "local" did not save "image.png"');

    expect(getFileURL).not.toHaveBeenCalled();
    expect(db.createFile).not.toHaveBeenCalled();
  });

  it('persists tenantId and strategy-returned filepath metadata', async () => {
    const saveURL = jest.fn().mockResolvedValue({
      filepath: 'https://cdn.example.com/t/tenant-a/images/user-123/image.png',
      bytes: 512,
      type: 'image/png',
      dimensions: { width: 32, height: 64 },
    });
    const getFileURL = jest.fn();
    getStrategyFunctions.mockReturnValue({ saveURL, getFileURL });

    await processFileURL({
      fileStrategy: FileSources.cloudfront,
      userId: 'user-123',
      URL: 'https://example.com/image.png',
      fileName: 'image.png',
      basePath: 'images',
      context: FileContext.image_generation,
      tenantId: 'tenant-a',
    });

    expect(getFileURL).not.toHaveBeenCalled();
    expect(db.createFile).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'user-123',
        filepath: 'https://cdn.example.com/t/tenant-a/images/user-123/image.png',
        bytes: 512,
        filename: 'image.png',
        source: FileSources.cloudfront,
        type: 'image/png',
        context: FileContext.image_generation,
        tenantId: 'tenant-a',
        width: 32,
        height: 64,
      }),
      true,
    );
  });

  it('applies retention metadata for generated images when retention mode is all', async () => {
    getRetentionExpiry.mockResolvedValueOnce({
      expiredAt: new Date('2030-01-01T00:00:00.000Z'),
    });
    const saveURL = jest.fn().mockResolvedValue({
      filepath: 'https://cdn.example.com/t/tenant-a/images/user-123/image.png',
      bytes: 512,
      type: 'image/png',
    });
    const getFileURL = jest.fn();
    getStrategyFunctions.mockReturnValue({ saveURL, getFileURL });

    await processFileURL({
      fileStrategy: FileSources.cloudfront,
      userId: 'user-123',
      URL: 'https://example.com/image.png',
      fileName: 'image.png',
      basePath: 'images',
      context: FileContext.image_generation,
      tenantId: 'tenant-a',
      req: {
        user: { id: 'user-123', tenantId: 'tenant-a' },
        body: {},
        config: { interfaceConfig: { retentionMode: 'all' } },
      },
    });

    expect(db.createFile).toHaveBeenCalledWith(
      expect.objectContaining({
        expiredAt: new Date('2030-01-01T00:00:00.000Z'),
      }),
      true,
    );
  });

  it('applies retention metadata for retained non-temporary conversations', async () => {
    const saveURL = jest.fn().mockResolvedValue({
      filepath: 'https://cdn.example.com/t/tenant-a/images/user-123/image.png',
      bytes: 512,
      type: 'image/png',
    });
    const getFileURL = jest.fn();
    getStrategyFunctions.mockReturnValue({ saveURL, getFileURL });
    getRetentionExpiry.mockResolvedValueOnce({
      expiredAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    await processFileURL({
      fileStrategy: FileSources.cloudfront,
      userId: 'user-123',
      URL: 'https://example.com/image.png',
      fileName: 'image.png',
      basePath: 'images',
      context: FileContext.image_generation,
      tenantId: 'tenant-a',
      req: {
        user: { id: 'user-123', tenantId: 'tenant-a' },
        body: { conversationId: 'convo-123' },
        config: { interfaceConfig: { retentionMode: RetentionMode.TEMPORARY } },
      },
    });

    expect(db.createFile).toHaveBeenCalledWith(
      expect.objectContaining({
        expiredAt: new Date('2030-01-01T00:00:00.000Z'),
      }),
      true,
    );
  });

  it('keeps expired retained conversation files on the parent expiration', async () => {
    const parentExpiredAt = new Date('2020-01-01T00:00:00.000Z');
    const saveURL = jest.fn().mockResolvedValue({
      filepath: 'https://cdn.example.com/t/tenant-a/images/user-123/image.png',
      bytes: 512,
      type: 'image/png',
    });
    const getFileURL = jest.fn();
    getStrategyFunctions.mockReturnValue({ saveURL, getFileURL });
    getRetentionExpiry.mockResolvedValueOnce({ expiredAt: parentExpiredAt });

    await processFileURL({
      fileStrategy: FileSources.cloudfront,
      userId: 'user-123',
      URL: 'https://example.com/image.png',
      fileName: 'image.png',
      basePath: 'images',
      context: FileContext.image_generation,
      tenantId: 'tenant-a',
      req: {
        user: { id: 'user-123', tenantId: 'tenant-a' },
        body: { conversationId: 'convo-123' },
        config: { interfaceConfig: { retentionMode: RetentionMode.TEMPORARY } },
      },
    });

    expect(db.createFile).toHaveBeenCalledWith(
      expect.objectContaining({
        expiredAt: parentExpiredAt,
      }),
      true,
    );
  });

  it('falls back to getFileURL with user and tenant context when metadata lacks filepath', async () => {
    const saveURL = jest.fn().mockResolvedValue({
      bytes: 256,
      type: 'image/png',
    });
    const getFileURL = jest
      .fn()
      .mockResolvedValue('https://cdn.example.com/t/tenant-a/images/user-123/image.png');
    getStrategyFunctions.mockReturnValue({ saveURL, getFileURL });

    await processFileURL({
      fileStrategy: FileSources.cloudfront,
      userId: 'user-123',
      URL: 'https://example.com/image.png',
      fileName: 'image.png',
      basePath: 'images',
      context: FileContext.image_generation,
      tenantId: 'tenant-a',
    });

    expect(getFileURL).toHaveBeenCalledWith({
      userId: 'user-123',
      fileName: 'image.png',
      basePath: 'images',
      tenantId: 'tenant-a',
    });
    expect(db.createFile).toHaveBeenCalledWith(
      expect.objectContaining({
        filepath: 'https://cdn.example.com/t/tenant-a/images/user-123/image.png',
        tenantId: 'tenant-a',
      }),
      true,
    );
  });

  it('preserves the user path segment for local fallback URLs', async () => {
    const saveURL = jest.fn().mockResolvedValue({
      bytes: 256,
      type: 'image/png',
    });
    const getFileURL = jest.fn().mockResolvedValue('/images/user-123/image.png');
    getStrategyFunctions.mockReturnValue({ saveURL, getFileURL });

    await processFileURL({
      fileStrategy: FileSources.local,
      userId: 'user-123',
      URL: 'https://example.com/image.png',
      fileName: 'image.png',
      basePath: 'images',
      context: FileContext.image_generation,
      tenantId: 'tenant-a',
    });

    expect(getFileURL).toHaveBeenCalledWith({
      userId: 'user-123',
      fileName: 'user-123/image.png',
      basePath: 'images',
      tenantId: 'tenant-a',
    });
    expect(db.createFile).toHaveBeenCalledWith(
      expect.objectContaining({
        filepath: '/images/user-123/image.png',
        tenantId: 'tenant-a',
      }),
      true,
    );
  });
});

describe('sweepExpiredFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes expired file storage before removing file records', async () => {
    const deleteFile = jest.fn().mockResolvedValue(undefined);
    getStrategyFunctions.mockReturnValue({ deleteFile });
    db.getExpiredFiles.mockResolvedValue([
      {
        file_id: 'expired-file',
        filepath: '/images/user-123/expired.png',
        source: FileSources.local,
        user: 'user-123',
        tenantId: 'tenant-a',
      },
    ]);
    db.deleteFiles.mockResolvedValue({ deletedCount: 1 });

    const result = await sweepExpiredFiles({
      appConfig: { paths: { publicPath: '/tmp/public', uploads: '/tmp/uploads' } },
      limit: 1,
    });

    expect(deleteFile).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { id: 'user-123', tenantId: 'tenant-a' },
      }),
      expect.objectContaining({ file_id: 'expired-file' }),
    );
    expect(db.deleteFiles).toHaveBeenCalledWith(['expired-file']);
    expect(result).toEqual({ scanned: 1, deleted: 1, failed: 0 });
  });

  it('counts storage delete failures as failed even when metadata is already gone', async () => {
    const deleteFile = jest.fn().mockRejectedValue(new Error('storage unavailable'));
    getStrategyFunctions.mockReturnValue({ deleteFile });
    db.getExpiredFiles.mockResolvedValue([
      {
        file_id: 'expired-file',
        filepath: '/images/user-123/expired.png',
        source: FileSources.local,
        user: 'user-123',
        tenantId: 'tenant-a',
      },
    ]);
    db.deleteFiles.mockResolvedValue({ deletedCount: 0 });

    const result = await sweepExpiredFiles({
      appConfig: { paths: { publicPath: '/tmp/public', uploads: '/tmp/uploads' } },
      limit: 1,
    });

    expect(deleteFile).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { id: 'user-123', tenantId: 'tenant-a' },
      }),
      expect.objectContaining({ file_id: 'expired-file' }),
    );
    expect(db.deleteFiles).not.toHaveBeenCalledWith(['expired-file']);
    expect(result).toEqual({ scanned: 1, deleted: 0, failed: 1 });
  });

  test.each([
    [
      FileSources.openai,
      EModelEndpoint.assistants,
      { [EModelEndpoint.assistants]: { version: 'v3' } },
      '3',
    ],
    [
      FileSources.azure,
      EModelEndpoint.azureAssistants,
      {
        [EModelEndpoint.azureOpenAI]: { assistants: true },
        [EModelEndpoint.azureAssistants]: { version: 4 },
      },
      '4',
    ],
  ])(
    'passes assistant request context when deleting %s expired files',
    async (source, endpoint, endpoints, version) => {
      const openaiClient = { files: {} };
      const deleteFile = jest.fn().mockResolvedValue(undefined);
      const loadAppConfig = jest.fn().mockResolvedValue({ endpoints });

      getOpenAIClient.mockResolvedValue({ openai: openaiClient });
      getStrategyFunctions.mockReturnValue({ deleteFile });
      LB_QueueAsyncCall.mockImplementation(async (fn, args, callback) => {
        try {
          callback(null, await fn(...args));
        } catch (error) {
          callback(error);
        }
      });
      db.getExpiredFiles.mockResolvedValue([
        {
          file_id: `expired-${source}-file`,
          source,
          user: 'user-123',
          tenantId: 'tenant-a',
        },
      ]);
      db.deleteFiles.mockResolvedValue({ deletedCount: 1 });

      const result = await sweepExpiredFiles({
        appConfig: { paths: { publicPath: '/tmp/public', uploads: '/tmp/uploads' } },
        loadAppConfig,
        limit: 1,
      });

      expect(loadAppConfig).toHaveBeenCalledTimes(1);
      expect(getOpenAIClient).toHaveBeenCalledWith(
        expect.objectContaining({
          overrideEndpoint: endpoint,
          req: expect.objectContaining({
            baseUrl: `/api/assistants/v${version}`,
            originalUrl: `/api/assistants/v${version}/files`,
            body: expect.objectContaining({ endpoint, version }),
            config: expect.objectContaining({ endpoints }),
            user: { id: 'user-123', tenantId: 'tenant-a' },
          }),
        }),
      );
      expect(deleteFile).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: `/api/assistants/v${version}`,
          config: expect.objectContaining({ endpoints }),
        }),
        expect.objectContaining({ file_id: `expired-${source}-file` }),
        openaiClient,
      );
      expect(result).toEqual({ scanned: 1, deleted: 1, failed: 0 });
    },
  );
});

describe('startExpiredFileSweep', () => {
  const originalInterval = process.env.FILE_RETENTION_SWEEP_INTERVAL_MS;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalInterval === undefined) {
      delete process.env.FILE_RETENTION_SWEEP_INTERVAL_MS;
      return;
    }

    process.env.FILE_RETENTION_SWEEP_INTERVAL_MS = originalInterval;
  });

  it('uses the default interval when the sweep interval env var is empty', async () => {
    jest.useFakeTimers();
    process.env.FILE_RETENTION_SWEEP_INTERVAL_MS = '';
    db.getExpiredFiles.mockResolvedValue([]);

    const interval = startExpiredFileSweep({
      appConfig: { paths: { publicPath: '/tmp/public', uploads: '/tmp/uploads' } },
    });

    await flushPromises();
    expect(interval).not.toBeNull();
    expect(db.getExpiredFiles).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(60 * 60 * 1000);
    await flushPromises();
    expect(db.getExpiredFiles).toHaveBeenCalledTimes(2);

    clearInterval(interval);
  });

  it('uses the default interval when the sweep interval env var is sub-millisecond', async () => {
    jest.useFakeTimers();
    process.env.FILE_RETENTION_SWEEP_INTERVAL_MS = '0.5';
    db.getExpiredFiles.mockResolvedValue([]);

    const interval = startExpiredFileSweep({
      appConfig: { paths: { publicPath: '/tmp/public', uploads: '/tmp/uploads' } },
    });

    await flushPromises();
    expect(interval).not.toBeNull();
    expect(db.getExpiredFiles).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1);
    await flushPromises();
    expect(db.getExpiredFiles).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(60 * 60 * 1000);
    await flushPromises();
    expect(db.getExpiredFiles).toHaveBeenCalledTimes(2);

    clearInterval(interval);
  });

  it('does not start another sweep while one is in progress', async () => {
    jest.useFakeTimers();
    process.env.FILE_RETENTION_SWEEP_INTERVAL_MS = '10';
    let resolveSweep;
    db.getExpiredFiles.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSweep = () => resolve([]);
        }),
    );

    const interval = startExpiredFileSweep({
      appConfig: { paths: { publicPath: '/tmp/public', uploads: '/tmp/uploads' } },
    });

    await flushPromises();
    expect(db.getExpiredFiles).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(30);
    await flushPromises();
    expect(db.getExpiredFiles).toHaveBeenCalledTimes(1);

    resolveSweep();
    await flushPromises();

    jest.advanceTimersByTime(10);
    await flushPromises();
    expect(db.getExpiredFiles).toHaveBeenCalledTimes(2);

    clearInterval(interval);
  });
});
