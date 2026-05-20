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
  return {
    sanitizeFilename: jest.fn((n) => n),
    parseText: jest.fn().mockResolvedValue({ text: '', bytes: 0 }),
    processAudioFile: jest.fn(),
    getStorageMetadata: jest.fn(() => ({})),
    isFileStorageLimitError: jest.fn((error) => error?.code === 'FILE_STORAGE_LIMIT_EXCEEDED'),
    assertFileStorageLimit: jest.fn().mockResolvedValue(undefined),
    recordFileStorageUsage: jest.fn(),
    getRetentionExpiry: jest.fn(() => ({})),
    sweepExpiredFiles: jest.fn().mockResolvedValue({ scanned: 0, deleted: 0, failed: 0 }),
    startExpiredFileSweep: jest.fn().mockReturnValue('sweep-interval'),
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
  getUserStorageUsage: jest.fn().mockResolvedValue(0),
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

jest.mock('./VectorDB/crud', () => ({
  uploadVectors: jest.fn(),
}));

jest.mock('~/server/utils', () => ({
  determineFileType: jest.fn(),
}));

jest.mock('~/server/services/Files/Audio/STTService', () => ({
  STTService: { getInstance: jest.fn() },
}));

const {
  assertFileStorageLimit,
  getRetentionExpiry,
  sweepExpiredFiles: sweepExpiredFilesWithDeps,
  startExpiredFileSweep: startExpiredFileSweepWithDeps,
} = require('@librechat/api');
const {
  EToolResources,
  FileSources,
  FileContext,
  EModelEndpoint,
  RetentionMode,
  AgentCapabilities,
} = require('librechat-data-provider');
const { mergeFileConfig } = require('librechat-data-provider');
const { checkCapability } = require('~/server/services/Config');
const { getOpenAIClient } = require('~/server/controllers/assistants/helpers');
const { addResourceFileId, deleteResourceFileId } = require('~/server/controllers/assistants/v2');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { getFileStrategy } = require('~/server/utils/getFileStrategy');
const { uploadVectors } = require('./VectorDB/crud');
const { convertImage, resizeImageBuffer } = require('~/server/services/Files/images');
const db = require('~/models');
const {
  processAgentFileUpload,
  processDeleteRequest,
  processFileURL,
  processImageFile,
  processFileUpload,
  retrieveAndProcessFile,
  saveBase64Image,
  sweepExpiredFiles,
  startExpiredFileSweep,
  uploadImageBuffer,
} = require('./process');

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLS_MIME = 'application/vnd.ms-excel';
const ODS_MIME = 'application/vnd.oasis.opendocument.spreadsheet';
const ODT_MIME = 'application/vnd.oasis.opendocument.text';
const ODP_MIME = 'application/vnd.oasis.opendocument.presentation';
const ODG_MIME = 'application/vnd.oasis.opendocument.graphics';

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
    assertFileStorageLimit.mockResolvedValue(undefined);
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

  test('rejects over-limit uploads before storage processing starts', async () => {
    const error = Object.assign(new Error('storage limit exceeded.'), {
      code: 'FILE_STORAGE_LIMIT_EXCEEDED',
      status: 413,
    });
    assertFileStorageLimit.mockRejectedValueOnce(error);
    const req = makeReq({ mimetype: PDF_MIME, ocrConfig: null });
    req.file.size = 1024;

    await expect(
      processAgentFileUpload({
        req,
        res: mockRes,
        metadata: { ...makeMetadata(), tool_resource: EToolResources.file_search },
      }),
    ).rejects.toThrow('storage limit exceeded');

    expect(getStrategyFunctions).not.toHaveBeenCalled();
    expect(db.createFile).not.toHaveBeenCalled();
  });

  test('does not attach an agent resource when the final storage check rejects', async () => {
    const error = Object.assign(new Error('storage limit exceeded.'), {
      code: 'FILE_STORAGE_LIMIT_EXCEEDED',
      status: 413,
    });
    assertFileStorageLimit.mockRejectedValueOnce(error);
    const req = makeReq({ mimetype: PDF_MIME, ocrConfig: null });
    req.file.size = 16;

    await expect(
      processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() }),
    ).rejects.toThrow('storage limit exceeded');

    expect(db.createFile).not.toHaveBeenCalled();
    expect(db.addAgentResourceFile).not.toHaveBeenCalled();
  });

  test('checks context upload quota against extracted text bytes, not raw upload bytes', async () => {
    const rawUploadBytes = 10 * 1024 * 1024;
    const extractedBytes = 42;
    const rawBytesError = Object.assign(new Error('storage limit exceeded.'), {
      code: 'FILE_STORAGE_LIMIT_EXCEEDED',
      status: 413,
    });
    assertFileStorageLimit.mockImplementation(({ incomingBytes }) => {
      if (incomingBytes === rawUploadBytes) {
        return Promise.reject(rawBytesError);
      }
      return Promise.resolve();
    });
    getStrategyFunctions.mockReturnValue({
      handleFileUpload: jest.fn().mockResolvedValue({
        text: 'small extracted text',
        bytes: extractedBytes,
        filepath: 'doc://result',
      }),
    });
    const req = makeReq({ mimetype: PDF_MIME, ocrConfig: null });
    req.file.size = rawUploadBytes;

    await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

    expect(assertFileStorageLimit).toHaveBeenCalledTimes(1);
    expect(assertFileStorageLimit).toHaveBeenCalledWith(
      expect.objectContaining({ incomingBytes: extractedBytes }),
    );
    expect(db.createFile).toHaveBeenCalledWith(
      expect.objectContaining({ bytes: extractedBytes, source: FileSources.text }),
      true,
    );
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

  describe('storage-limit cleanup after secondary processing', () => {
    it('cleans up original agent image storage when image persistence quota fails', async () => {
      const error = Object.assign(new Error('storage limit exceeded.'), {
        code: 'FILE_STORAGE_LIMIT_EXCEEDED',
        status: 413,
      });
      const handleFileUpload = jest.fn().mockResolvedValue({
        bytes: 700,
        filename: 'image.png',
        filepath: '/uploads/user-123/original.png',
      });
      const handleImageUpload = jest.fn().mockResolvedValue({
        filepath: '/images/user-123/resized.png',
        bytes: 100,
        width: 32,
        height: 32,
      });
      const deleteFile = jest.fn().mockResolvedValue(undefined);
      getStrategyFunctions.mockReturnValue({ handleFileUpload, handleImageUpload, deleteFile });
      assertFileStorageLimit.mockResolvedValueOnce(undefined).mockRejectedValueOnce(error);
      const req = makeReq({ mimetype: 'image/png' });
      req.config.imageOutputType = 'png';

      await expect(
        processAgentFileUpload({
          req,
          res: mockRes,
          metadata: { file_id: 'agent-file-id', message_file: true },
        }),
      ).rejects.toThrow('storage limit exceeded');

      expect(deleteFile).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ filepath: '/images/user-123/resized.png' }),
        undefined,
      );
      expect(deleteFile).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ filepath: '/uploads/user-123/original.png' }),
        undefined,
      );
      expect(db.createFile).not.toHaveBeenCalled();
    });

    it('cleans up agent image side effects when final metadata quota check fails', async () => {
      const error = Object.assign(new Error('storage limit exceeded.'), {
        code: 'FILE_STORAGE_LIMIT_EXCEEDED',
        status: 413,
      });
      const handleFileUpload = jest.fn().mockResolvedValue({
        bytes: 700,
        filename: 'image.png',
        filepath: '/uploads/user-123/original.png',
      });
      const handleImageUpload = jest.fn().mockResolvedValue({
        filepath: '/images/user-123/resized.png',
        bytes: 100,
        width: 32,
        height: 32,
      });
      const deleteFile = jest.fn().mockResolvedValue(undefined);
      getStrategyFunctions.mockReturnValue({ handleFileUpload, handleImageUpload, deleteFile });
      db.createFile.mockImplementation((fileInfo) => Promise.resolve(fileInfo));
      db.deleteFiles.mockResolvedValue({ deletedCount: 1 });
      assertFileStorageLimit
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(error);
      const req = makeReq({ mimetype: 'image/png' });
      req.config.imageOutputType = 'png';

      await expect(
        processAgentFileUpload({
          req,
          res: mockRes,
          metadata: { file_id: 'agent-file-id', message_file: true },
        }),
      ).rejects.toThrow('storage limit exceeded');

      expect(db.deleteFiles).toHaveBeenCalledWith(['mock-uuid']);
      expect(deleteFile).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ filepath: '/uploads/user-123/original.png' }),
        undefined,
      );
      expect(deleteFile).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ filepath: '/images/user-123/resized.png' }),
        undefined,
      );
    });

    it('uses converted image metadata for the final agent image record', async () => {
      const handleFileUpload = jest.fn().mockResolvedValue({
        bytes: 100,
        filename: 'image.jpg',
        filepath: '/uploads/user-123/original.jpg',
      });
      const handleImageUpload = jest.fn().mockResolvedValue({
        filepath: '/images/user-123/resized.png',
        bytes: 700,
        width: 32,
        height: 64,
      });
      getStrategyFunctions.mockReturnValue({ handleFileUpload, handleImageUpload });
      db.createFile.mockImplementation((fileInfo) => Promise.resolve(fileInfo));
      const req = makeReq({ mimetype: 'image/jpeg' });
      req.config.imageOutputType = 'png';

      await processAgentFileUpload({
        req,
        res: mockRes,
        metadata: { file_id: 'agent-file-id', message_file: true },
      });

      const [finalFile] = db.createFile.mock.calls.find(
        ([fileInfo]) => fileInfo.file_id === 'agent-file-id',
      );
      expect(finalFile).toEqual(
        expect.objectContaining({
          bytes: 700,
          filepath: '/images/user-123/resized.png',
          source: FileSources.local,
          type: 'image/png',
          width: 32,
          height: 64,
        }),
      );
      expect(assertFileStorageLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          incomingBytes: 700,
          excludeFileId: 'agent-file-id',
        }),
      );
    });

    it('cleans up vector embeddings when file_search metadata quota check fails', async () => {
      const error = Object.assign(new Error('storage limit exceeded.'), {
        code: 'FILE_STORAGE_LIMIT_EXCEEDED',
        status: 413,
      });
      const handleFileUpload = jest.fn().mockResolvedValue({
        bytes: 700,
        filename: 'doc.pdf',
        filepath: '/uploads/user-123/doc.pdf',
      });
      const deleteStoredFile = jest.fn().mockResolvedValue(undefined);
      const deleteVectorFile = jest.fn().mockResolvedValue(undefined);
      getStrategyFunctions.mockImplementation((source) =>
        source === FileSources.vectordb
          ? { deleteFile: deleteVectorFile }
          : { handleFileUpload, deleteFile: deleteStoredFile },
      );
      uploadVectors.mockResolvedValue({
        bytes: 700,
        filename: 'doc.pdf',
        filepath: FileSources.vectordb,
        embedded: true,
      });
      assertFileStorageLimit
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(error);

      await expect(
        processAgentFileUpload({
          req: makeReq(),
          res: mockRes,
          metadata: {
            agent_id: 'agent-abc',
            tool_resource: EToolResources.file_search,
            file_id: 'agent-file-id',
          },
        }),
      ).rejects.toThrow('storage limit exceeded');

      expect(deleteStoredFile).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ filepath: '/uploads/user-123/doc.pdf' }),
        undefined,
      );
      expect(deleteVectorFile).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          file_id: 'agent-file-id',
          source: FileSources.vectordb,
          embedded: true,
        }),
      );
      expect(db.createFile).not.toHaveBeenCalled();
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
      const codeEnvDelete = jest.fn().mockResolvedValue(undefined);
      const localUpload = jest.fn().mockResolvedValue({
        bytes: 0,
        filename: 'upload.bin',
        filepath: '/uploads/upload.bin',
      });
      const localDelete = jest.fn().mockResolvedValue(undefined);
      getStrategyFunctions.mockImplementation((src) =>
        src === FileSources.execute_code
          ? { handleFileUpload: codeEnvUpload, deleteFile: codeEnvDelete }
          : { handleFileUpload: localUpload, deleteFile: localDelete, saveBuffer: jest.fn() },
      );
      return { codeEnvUpload, codeEnvDelete, localDelete };
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

    it('rolls back code env uploads when final storage quota rejects', async () => {
      const error = Object.assign(new Error('storage limit exceeded.'), {
        code: 'FILE_STORAGE_LIMIT_EXCEEDED',
        status: 413,
      });
      const { codeEnvDelete, localDelete } = setupCodeEnvUpload({
        storage_session_id: 'sess-4',
        file_id: 'fid-4',
      });
      assertFileStorageLimit.mockResolvedValueOnce(undefined).mockRejectedValueOnce(error);
      const req = makeReq();

      await expect(
        processAgentFileUpload({
          req,
          res: mockRes,
          metadata: {
            agent_id: 'agent-abc',
            tool_resource: EToolResources.execute_code,
            file_id: 'file-uuid',
          },
        }),
      ).rejects.toThrow('storage limit exceeded');

      expect(localDelete).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ filepath: '/uploads/upload.bin' }),
        undefined,
      );
      expect(codeEnvDelete).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          metadata: {
            codeEnvRef: {
              kind: 'agent',
              id: 'agent-abc',
              storage_session_id: 'sess-4',
              file_id: 'fid-4',
            },
          },
        }),
      );
      expect(db.createFile).not.toHaveBeenCalled();
    });

    it('rolls back persisted execute_code uploads when agent resource linking fails', async () => {
      const { codeEnvDelete, localDelete } = setupCodeEnvUpload({
        storage_session_id: 'sess-link',
        file_id: 'fid-link',
      });
      db.createFile.mockImplementation((fileInfo) => Promise.resolve(fileInfo));
      db.addAgentResourceFile.mockRejectedValueOnce(new Error('link failed'));
      const req = makeReq();

      await expect(
        processAgentFileUpload({
          req,
          res: mockRes,
          metadata: {
            agent_id: 'agent-abc',
            tool_resource: EToolResources.execute_code,
            file_id: 'file-uuid',
          },
        }),
      ).rejects.toThrow('link failed');

      expect(db.deleteFiles).toHaveBeenCalledWith(['file-uuid']);
      expect(localDelete).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ filepath: '/uploads/upload.bin' }),
        undefined,
      );
      expect(codeEnvDelete).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          metadata: {
            codeEnvRef: {
              kind: 'agent',
              id: 'agent-abc',
              storage_session_id: 'sess-link',
              file_id: 'fid-link',
            },
          },
        }),
      );
    });
  });
});

describe('processImageFile storage-limit checks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    assertFileStorageLimit.mockResolvedValue(undefined);
    db.createFile.mockImplementation((fileInfo) => Promise.resolve(fileInfo));
    mockRes.status.mockReturnThis();
    mockRes.json.mockReturnValue({});
  });

  it('checks quota against persisted image bytes, not raw upload bytes', async () => {
    const rawUploadBytes = 10 * 1024 * 1024;
    const persistedBytes = 256;
    const rawBytesError = Object.assign(new Error('storage limit exceeded.'), {
      code: 'FILE_STORAGE_LIMIT_EXCEEDED',
      status: 413,
    });
    assertFileStorageLimit.mockImplementation(({ incomingBytes }) => {
      if (incomingBytes === rawUploadBytes) {
        return Promise.reject(rawBytesError);
      }
      return Promise.resolve();
    });
    const handleImageUpload = jest.fn().mockResolvedValue({
      filepath: '/images/user-123/image.png',
      bytes: persistedBytes,
      width: 32,
      height: 32,
    });
    getStrategyFunctions.mockReturnValue({ handleImageUpload });
    const req = makeReq({ mimetype: 'image/png' });
    req.file.size = rawUploadBytes;
    req.config.imageOutputType = 'png';

    await processImageFile({
      req,
      res: mockRes,
      metadata: { file_id: 'image-file-id', endpoint: 'agents' },
    });

    expect(handleImageUpload).toHaveBeenCalled();
    expect(assertFileStorageLimit).toHaveBeenCalledTimes(1);
    expect(assertFileStorageLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        incomingBytes: persistedBytes,
        excludeFileId: 'image-file-id',
      }),
    );
  });
});

describe('processFileUpload assistant storage-limit cleanup', () => {
  const makeAssistantImageReq = () => ({
    user: { id: 'user-123', tenantId: 'tenant-a' },
    file: {
      path: '/tmp/image.png',
      originalname: 'image.png',
      filename: 'image.png',
      mimetype: 'image/png',
      size: 128,
    },
    body: { model: 'gpt-4o' },
    config: {
      fileConfig: { storageLimit: 1 },
      fileStrategy: FileSources.local,
      imageOutputType: 'png',
    },
  });

  const makeOpenAI = () => ({
    baseURL: 'https://api.openai.test/v1',
    files: {
      del: jest.fn().mockResolvedValue({ deleted: true }),
    },
    beta: {
      assistants: {
        files: {
          create: jest.fn().mockResolvedValue({}),
          del: jest.fn().mockResolvedValue({ deleted: true }),
        },
      },
    },
  });

  const setupAssistantStrategies = () => {
    const deleteOpenAIFile = jest.fn((req, file, openai) => openai.files.del(file.file_id));
    const deleteLocalFile = jest.fn().mockResolvedValue(undefined);
    const uploadAssistantFile = jest.fn().mockResolvedValue({
      id: 'file-openai',
      bytes: 200,
      filename: 'image.png',
    });
    const uploadLocalImage = jest.fn().mockResolvedValue({
      filepath: '/images/user-123/local-image.png',
      bytes: 300,
      width: 32,
      height: 32,
    });

    getStrategyFunctions.mockImplementation((source) =>
      source === FileSources.openai
        ? { handleFileUpload: uploadAssistantFile, deleteFile: deleteOpenAIFile }
        : { handleImageUpload: uploadLocalImage, deleteFile: deleteLocalFile },
    );

    return {
      deleteOpenAIFile,
      deleteLocalFile,
      uploadAssistantFile,
      uploadLocalImage,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    assertFileStorageLimit.mockResolvedValue(undefined);
    db.createFile.mockResolvedValue({ file_id: 'created-file-id' });
    db.deleteFiles.mockResolvedValue(undefined);
    mockRes.status.mockReturnThis();
    mockRes.json.mockReturnValue({});
  });

  it('removes an assistant tool-resource file when image persistence fails quota after upload', async () => {
    const error = Object.assign(new Error('storage limit exceeded.'), {
      code: 'FILE_STORAGE_LIMIT_EXCEEDED',
      status: 413,
    });
    const openai = makeOpenAI();
    const { deleteOpenAIFile } = setupAssistantStrategies();
    getOpenAIClient.mockResolvedValue({ openai });
    assertFileStorageLimit.mockResolvedValueOnce(undefined).mockRejectedValueOnce(error);

    await expect(
      processFileUpload({
        req: makeAssistantImageReq(),
        res: mockRes,
        metadata: {
          endpoint: EModelEndpoint.assistants,
          assistant_id: 'asst-1',
          tool_resource: EToolResources.file_search,
          file_id: 'metadata-file-id',
        },
      }),
    ).rejects.toThrow('storage limit exceeded');

    expect(addResourceFileId).toHaveBeenCalledWith(
      expect.objectContaining({
        file_id: 'file-openai',
        assistant_id: 'asst-1',
        tool_resource: EToolResources.file_search,
      }),
    );
    expect(deleteResourceFileId).toHaveBeenCalledWith(
      expect.objectContaining({
        file_id: 'file-openai',
        assistant_id: 'asst-1',
        tool_resource: EToolResources.file_search,
      }),
    );
    expect(deleteOpenAIFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ file_id: 'file-openai', source: FileSources.openai }),
      openai,
    );
    expect(db.createFile).not.toHaveBeenCalled();
  });

  it('rolls back the local assistant image record when assistant metadata persistence fails quota', async () => {
    const error = Object.assign(new Error('storage limit exceeded.'), {
      code: 'FILE_STORAGE_LIMIT_EXCEEDED',
      status: 413,
    });
    const openai = makeOpenAI();
    const { deleteOpenAIFile, deleteLocalFile } = setupAssistantStrategies();
    getOpenAIClient.mockResolvedValue({ openai });
    db.createFile.mockImplementation((fileInfo) => Promise.resolve(fileInfo));
    db.deleteFiles.mockResolvedValue({ deletedCount: 1 });
    assertFileStorageLimit
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(error);

    await expect(
      processFileUpload({
        req: makeAssistantImageReq(),
        res: mockRes,
        metadata: {
          endpoint: EModelEndpoint.assistants,
          assistant_id: 'asst-1',
          file_id: 'metadata-file-id',
        },
      }),
    ).rejects.toThrow('storage limit exceeded');

    expect(openai.beta.assistants.files.del).toHaveBeenCalledWith('asst-1', 'file-openai');
    expect(deleteOpenAIFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ file_id: 'file-openai', source: FileSources.openai }),
      openai,
    );
    expect(deleteLocalFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        file_id: 'mock-uuid',
        filepath: '/images/user-123/local-image.png',
        source: FileSources.local,
      }),
      undefined,
    );
    expect(db.deleteFiles).toHaveBeenCalledWith(['mock-uuid']);
    expect(db.createFile).toHaveBeenCalledTimes(1);
  });
});

describe('processFileURL', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    assertFileStorageLimit.mockResolvedValue(undefined);
    db.createFile.mockResolvedValue({ file_id: 'created-file-id' });
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

  it('cleans up URL-saved files when the final storage limit check fails', async () => {
    const error = Object.assign(new Error('storage limit exceeded.'), {
      code: 'FILE_STORAGE_LIMIT_EXCEEDED',
      status: 413,
    });
    const saveURL = jest.fn().mockResolvedValue({
      filepath: 'https://cdn.example.com/t/tenant-a/images/user-123/image.png',
      bytes: 512,
      type: 'image/png',
    });
    const getFileURL = jest.fn();
    const deleteFile = jest.fn().mockResolvedValue(undefined);
    getStrategyFunctions.mockReturnValue({ saveURL, getFileURL, deleteFile });
    assertFileStorageLimit.mockRejectedValueOnce(error);

    await expect(
      processFileURL({
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
          config: { fileConfig: { storageLimit: 1 } },
        },
      }),
    ).rejects.toThrow('storage limit exceeded');

    expect(deleteFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        filepath: 'https://cdn.example.com/t/tenant-a/images/user-123/image.png',
        source: FileSources.cloudfront,
      }),
      undefined,
    );
    expect(db.createFile).not.toHaveBeenCalled();
  });

  it('passes request path config to local URL cleanup on storage limit failure', async () => {
    const error = Object.assign(new Error('storage limit exceeded.'), {
      code: 'FILE_STORAGE_LIMIT_EXCEEDED',
      status: 413,
    });
    const paths = { publicPath: '/srv/public', uploads: '/srv/uploads' };
    const saveURL = jest.fn().mockResolvedValue({
      filepath: '/images/user-123/image.png',
      bytes: 512,
      type: 'image/png',
    });
    const deleteFile = jest.fn().mockResolvedValue(undefined);
    getStrategyFunctions.mockReturnValue({ saveURL, deleteFile });
    assertFileStorageLimit.mockRejectedValueOnce(error);

    await expect(
      processFileURL({
        fileStrategy: FileSources.local,
        userId: 'user-123',
        URL: 'https://example.com/image.png',
        fileName: 'image.png',
        basePath: 'images',
        context: FileContext.image_generation,
        tenantId: 'tenant-a',
        req: {
          user: { id: 'user-123', tenantId: 'tenant-a' },
          body: {},
          config: { fileConfig: { storageLimit: 1 }, paths },
        },
      }),
    ).rejects.toThrow('storage limit exceeded');

    expect(deleteFile).toHaveBeenCalledWith(
      expect.objectContaining({ config: expect.objectContaining({ paths }) }),
      expect.objectContaining({
        filepath: '/images/user-123/image.png',
        source: FileSources.local,
      }),
      undefined,
    );
    expect(db.createFile).not.toHaveBeenCalled();
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

  it('cleans up and rejects request-scoped URL saves without byte metadata', async () => {
    const saveURL = jest.fn().mockResolvedValue('/images/user-123/image.png');
    const deleteFile = jest.fn().mockResolvedValue(undefined);
    getStrategyFunctions.mockReturnValue({ saveURL, deleteFile });

    await expect(
      processFileURL({
        fileStrategy: FileSources.local,
        userId: 'user-123',
        URL: 'https://example.com/image.png',
        fileName: 'image.png',
        basePath: 'images',
        context: FileContext.image_generation,
        tenantId: 'tenant-a',
        req: {
          user: { id: 'user-123', tenantId: 'tenant-a' },
          body: {},
          config: { fileConfig: { storageLimit: 1 } },
        },
      }),
    ).rejects.toThrow('did not return byte metadata');

    expect(deleteFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        filepath: '/images/user-123/image.png',
        source: FileSources.local,
      }),
      undefined,
    );
    expect(db.createFile).not.toHaveBeenCalled();
  });
});

describe('generated image quota paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    assertFileStorageLimit.mockResolvedValue(undefined);
    db.createFile.mockResolvedValue({ file_id: 'created-file-id' });
  });

  it('uploadImageBuffer rejects over-limit images before saving the buffer', async () => {
    const error = Object.assign(new Error('storage limit exceeded.'), {
      code: 'FILE_STORAGE_LIMIT_EXCEEDED',
      status: 413,
    });
    const saveBuffer = jest.fn();
    getStrategyFunctions.mockReturnValue({ saveBuffer });
    assertFileStorageLimit.mockRejectedValueOnce(error);

    await expect(
      uploadImageBuffer({
        req: {
          user: { id: 'user-123', tenantId: 'tenant-a' },
          file: { originalname: 'input.png' },
          body: {},
          config: { fileConfig: { storageLimit: 1 }, imageOutputType: 'webp' },
        },
        context: FileContext.image_generation,
        resize: false,
        metadata: {
          buffer: Buffer.from('image'),
          bytes: 512,
          width: 10,
          height: 10,
          filename: 'image.webp',
          file_id: 'image-file-id',
          type: 'image/webp',
        },
      }),
    ).rejects.toThrow('storage limit exceeded');

    expect(saveBuffer).not.toHaveBeenCalled();
    expect(db.createFile).not.toHaveBeenCalled();
  });

  it('saveBase64Image rejects over-limit resized images before saving the buffer', async () => {
    const error = Object.assign(new Error('storage limit exceeded.'), {
      code: 'FILE_STORAGE_LIMIT_EXCEEDED',
      status: 413,
    });
    const saveBuffer = jest.fn();
    getStrategyFunctions.mockReturnValue({ saveBuffer });
    resizeImageBuffer.mockResolvedValue({
      buffer: Buffer.from('resized'),
      bytes: 512,
      width: 10,
      height: 10,
    });
    assertFileStorageLimit.mockRejectedValueOnce(error);

    await expect(
      saveBase64Image('data:image/png;base64,aW1hZ2U=', {
        req: {
          user: { id: 'user-123', tenantId: 'tenant-a' },
          body: {},
          config: {
            fileConfig: { storageLimit: 1, imageGeneration: 'low' },
            imageOutputType: 'webp',
          },
        },
        filename: 'image.png',
        endpoint: EModelEndpoint.openAI,
        context: FileContext.image_generation,
      }),
    ).rejects.toThrow('storage limit exceeded');

    expect(saveBuffer).not.toHaveBeenCalled();
    expect(db.createFile).not.toHaveBeenCalled();
  });

  it('retrieveAndProcessFile applies quota to OpenAI file metadata with explicit req', async () => {
    const req = {
      user: { id: 'user-123', tenantId: 'tenant-a' },
      body: { endpoint: EModelEndpoint.assistants, model: 'gpt-4o' },
      config: { fileConfig: { storageLimit: 1 } },
    };
    const openai = {
      baseURL: 'https://api.openai.test',
      files: {
        retrieve: jest.fn().mockResolvedValue({
          bytes: 512,
          filename: 'remote.txt',
          purpose: 'assistants_output',
        }),
      },
    };

    await retrieveAndProcessFile({
      openai,
      client: { req },
      file_id: 'openai-file-id',
    });

    expect(assertFileStorageLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        req,
        incomingBytes: 512,
        excludeFileId: 'openai-file-id',
      }),
    );
    expect(db.createFile).toHaveBeenCalledWith(
      expect.objectContaining({
        file_id: 'openai-file-id',
        tenantId: 'tenant-a',
        source: FileSources.openai,
      }),
      true,
    );
  });

  it('retrieveAndProcessFile does not delete existing OpenAI files when metadata quota rejects', async () => {
    const error = Object.assign(new Error('storage limit exceeded.'), {
      code: 'FILE_STORAGE_LIMIT_EXCEEDED',
      status: 413,
    });
    const req = {
      user: { id: 'user-123', tenantId: 'tenant-a' },
      body: { endpoint: EModelEndpoint.assistants, model: 'gpt-4o' },
      config: { fileConfig: { storageLimit: 1 } },
    };
    const openai = {
      baseURL: 'https://api.openai.test',
      files: {
        retrieve: jest.fn().mockResolvedValue({
          bytes: 512,
          filename: 'remote.txt',
          purpose: 'assistants_output',
        }),
      },
    };
    const deleteFile = jest.fn();
    getStrategyFunctions.mockReturnValue({ deleteFile });
    assertFileStorageLimit.mockRejectedValueOnce(error);

    await expect(
      retrieveAndProcessFile({
        openai,
        client: { req },
        file_id: 'openai-file-id',
      }),
    ).rejects.toThrow('storage limit exceeded');

    expect(deleteFile).not.toHaveBeenCalled();
    expect(db.createFile).not.toHaveBeenCalled();
  });

  it('retrieveAndProcessFile rejects over-limit OpenAI image outputs before metadata persistence', async () => {
    const error = Object.assign(new Error('storage limit exceeded.'), {
      code: 'FILE_STORAGE_LIMIT_EXCEEDED',
      status: 413,
    });
    const req = {
      user: { id: 'user-123', tenantId: 'tenant-a' },
      body: { endpoint: EModelEndpoint.assistants, model: 'gpt-4o' },
      config: {
        fileConfig: { storageLimit: 1 },
        fileStrategy: FileSources.local,
        imageOutputType: 'webp',
      },
    };
    const openai = {
      baseURL: 'https://api.openai.test',
      files: {
        retrieve: jest.fn().mockResolvedValue({
          bytes: 1024,
          filename: 'image.png',
          purpose: 'assistants_output',
        }),
        content: jest.fn().mockResolvedValue({
          arrayBuffer: jest.fn().mockResolvedValue(Buffer.from('raw-image')),
        }),
      },
    };
    convertImage.mockResolvedValue({
      filepath: '/images/user-123/openai-file-id.webp',
      bytes: 512,
      width: 10,
      height: 10,
    });
    assertFileStorageLimit.mockRejectedValueOnce(error);

    await expect(
      retrieveAndProcessFile({
        openai,
        client: {
          req,
          attachedFileIds: new Set(),
          processedFileIds: new Set(),
        },
        file_id: 'openai-file-id',
        basename: 'image.png',
      }),
    ).rejects.toThrow('storage limit exceeded');

    expect(convertImage).toHaveBeenCalled();
    expect(db.createFile).not.toHaveBeenCalled();
  });

  it('cleans over-limit OpenAI image outputs with the file strategy used by conversion', async () => {
    const error = Object.assign(new Error('storage limit exceeded.'), {
      code: 'FILE_STORAGE_LIMIT_EXCEEDED',
      status: 413,
    });
    const req = {
      user: { id: 'user-123', tenantId: 'tenant-a' },
      body: { endpoint: EModelEndpoint.assistants, model: 'gpt-4o' },
      config: {
        fileConfig: { storageLimit: 1 },
        fileStrategy: FileSources.local,
        imageOutputType: 'webp',
      },
    };
    const openai = {
      baseURL: 'https://api.openai.test',
      files: {
        retrieve: jest.fn().mockResolvedValue({
          bytes: 1024,
          filename: 'image.png',
          purpose: 'assistants_output',
        }),
        content: jest.fn().mockResolvedValue({
          arrayBuffer: jest.fn().mockResolvedValue(Buffer.from('raw-image')),
        }),
      },
    };
    const deleteLocalFile = jest.fn().mockResolvedValue(undefined);
    const deleteImageStrategyFile = jest.fn().mockResolvedValue(undefined);
    getFileStrategy.mockReturnValueOnce('image-strategy');
    getStrategyFunctions.mockImplementation((source) =>
      source === FileSources.local
        ? { deleteFile: deleteLocalFile }
        : { deleteFile: deleteImageStrategyFile },
    );
    convertImage.mockResolvedValue({
      filepath: '/images/user-123/openai-file-id.webp',
      bytes: 512,
      width: 10,
      height: 10,
    });
    assertFileStorageLimit.mockRejectedValueOnce(error);

    await expect(
      retrieveAndProcessFile({
        openai,
        client: {
          req,
          attachedFileIds: new Set(),
          processedFileIds: new Set(),
        },
        file_id: 'openai-file-id',
        basename: 'image.png',
      }),
    ).rejects.toThrow('storage limit exceeded');

    expect(deleteLocalFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        filepath: '/images/user-123/openai-file-id.webp',
        source: FileSources.local,
      }),
      undefined,
    );
    expect(deleteImageStrategyFile).not.toHaveBeenCalled();
    expect(db.createFile).not.toHaveBeenCalled();
  });
});

describe('processDeleteRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('removes metadata when backing storage is already missing', async () => {
    const missingError = Object.assign(new Error('no such file'), { code: 'ENOENT' });
    const deleteFile = jest.fn().mockRejectedValue(missingError);
    getStrategyFunctions.mockReturnValue({ deleteFile });
    db.deleteFiles.mockResolvedValue({ deletedCount: 1 });

    const result = await processDeleteRequest({
      req: {
        body: {},
        config: {},
        user: { id: 'user-123', tenantId: 'tenant-a' },
      },
      files: [
        {
          file_id: 'expired-file',
          filepath: '/images/user-123/expired.png',
          source: FileSources.local,
        },
      ],
    });

    expect(db.deleteFiles).toHaveBeenCalledWith(['expired-file']);
    expect(result).toEqual({ deletedFileIds: ['expired-file'], failedFileIds: [] });
  });

  it('does not treat unrelated not found messages as missing storage', async () => {
    const deleteFile = jest.fn().mockRejectedValue(new Error('Configuration not found'));
    getStrategyFunctions.mockReturnValue({ deleteFile });

    const result = await processDeleteRequest({
      req: {
        body: {},
        config: {},
        user: { id: 'user-123', tenantId: 'tenant-a' },
      },
      files: [
        {
          file_id: 'expired-file',
          filepath: '/images/user-123/expired.png',
          source: FileSources.local,
        },
      ],
    });

    expect(db.deleteFiles).not.toHaveBeenCalled();
    expect(result).toEqual({ deletedFileIds: [], failedFileIds: ['expired-file'] });
  });

  it('throws metadata delete failures after storage deletion succeeds', async () => {
    const deleteFile = jest.fn().mockResolvedValue(undefined);
    const metadataError = new Error('mongo unavailable');
    getStrategyFunctions.mockReturnValue({ deleteFile });
    db.deleteFiles.mockRejectedValue(metadataError);

    await expect(
      processDeleteRequest({
        req: {
          body: {},
          config: {},
          user: { id: 'user-123', tenantId: 'tenant-a' },
        },
        files: [
          {
            file_id: 'expired-file',
            filepath: '/images/user-123/expired.png',
            source: FileSources.local,
          },
        ],
      }),
    ).rejects.toThrow('mongo unavailable');

    expect(db.deleteFiles).toHaveBeenCalledWith(['expired-file']);
    expect(db.removeAgentResourceFilesFromAllAgents).not.toHaveBeenCalled();
  });
});

describe('sweepExpiredFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates expired file sweeping to the shared package with backend dependencies', async () => {
    const options = {
      appConfig: { paths: { publicPath: '/tmp/public', uploads: '/tmp/uploads' } },
      limit: 1,
    };
    sweepExpiredFilesWithDeps.mockResolvedValue({ scanned: 1, deleted: 1, failed: 0 });

    const result = await sweepExpiredFiles(options);

    expect(sweepExpiredFilesWithDeps).toHaveBeenCalledWith(
      options,
      expect.objectContaining({
        getExpiredFiles: db.getExpiredFiles,
        processDeleteRequest: expect.any(Function),
        logger: expect.objectContaining({
          error: expect.any(Function),
          info: expect.any(Function),
          warn: expect.any(Function),
        }),
      }),
    );
    expect(result).toEqual({ scanned: 1, deleted: 1, failed: 0 });
  });
});

describe('startExpiredFileSweep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates background sweep startup to the shared package with system context', () => {
    const options = {
      appConfig: { paths: { publicPath: '/tmp/public', uploads: '/tmp/uploads' } },
    };

    const interval = startExpiredFileSweep(options);

    expect(startExpiredFileSweepWithDeps).toHaveBeenCalledWith(
      options,
      expect.objectContaining({
        sweepExpiredFiles: expect.any(Function),
        runAsSystem: expect.any(Function),
        logger: expect.objectContaining({
          error: expect.any(Function),
          info: expect.any(Function),
          warn: expect.any(Function),
        }),
      }),
    );
    expect(interval).toBe('sweep-interval');
  });
});
