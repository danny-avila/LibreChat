jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid') }));

jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

jest.mock('@librechat/agents', () => ({
  EnvVar: { CODE_API_KEY: 'CODE_API_KEY' },
}));

jest.mock('@librechat/api', () => ({
  sanitizeFilename: jest.fn((n) => n),
  parseText: jest.fn().mockResolvedValue({ text: '', bytes: 0 }),
  processAudioFile: jest.fn(),
}));

jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  mergeFileConfig: jest.fn(),
}));

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
  addAgentResourceFile: jest.fn().mockResolvedValue({}),
  removeAgentResourceFiles: jest.fn(),
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

jest.mock('./VectorDB/crud', () => ({
  uploadVectors: jest.fn().mockResolvedValue({ embedded: true, filename: 'embedded-upload.bin' }),
}));

const {
  EModelEndpoint,
  EToolResources,
  FileSources,
  AgentCapabilities,
} = require('librechat-data-provider');
const { mergeFileConfig } = require('librechat-data-provider');
const { checkCapability } = require('~/server/services/Config');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { uploadVectors } = require('./VectorDB/crud');
const { processAgentFileUpload, processImageFile } = require('./process');

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLS_MIME = 'application/vnd.ms-excel';
const ODS_MIME = 'application/vnd.oasis.opendocument.spreadsheet';
const ODT_MIME = 'application/vnd.oasis.opendocument.text';
const ODP_MIME = 'application/vnd.oasis.opendocument.presentation';
const ODG_MIME = 'application/vnd.oasis.opendocument.graphics';

const makeReq = ({ mimetype = PDF_MIME, ocrConfig = null } = {}) => ({
  user: { id: 'user-123' },
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
    imageOutputType: 'webp',
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

const makeFileConfig = ({
  ocrSupportedMimeTypes = [],
  sttSupportedMimeTypes = [],
  textSupportedMimeTypes = [],
} = {}) => ({
  checkType: (mime, types) => (types ?? []).includes(mime),
  ocr: { supportedMimeTypes: ocrSupportedMimeTypes },
  stt: { supportedMimeTypes: sttSupportedMimeTypes },
  text: { supportedMimeTypes: textSupportedMimeTypes },
});

describe('processAgentFileUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRes.status.mockReturnThis();
    mockRes.json.mockReturnValue({});
    checkCapability.mockResolvedValue(true);
    loadAuthValues.mockResolvedValue({ CODE_API_KEY: 'code-key' });
    uploadVectors.mockResolvedValue({ embedded: true, filename: 'embedded-upload.bin' });
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

  describe('text delivery storage', () => {
    test('stores the original file durably for plain text delivery records', async () => {
      const { parseText } = require('@librechat/api');
      const { createFile } = require('~/models');
      const storageUpload = jest.fn().mockResolvedValue({
        filepath: '/uploads/user-123/file-uuid-123__upload.bin',
        bytes: 128,
        filename: 'upload.bin',
        embedded: false,
      });
      mergeFileConfig.mockReturnValue(makeFileConfig({ textSupportedMimeTypes: ['text/plain'] }));
      parseText.mockResolvedValueOnce({ text: 'plain extracted text', bytes: 20 });
      getStrategyFunctions.mockReturnValue({ handleFileUpload: storageUpload });
      const req = makeReq({ mimetype: 'text/plain', ocrConfig: null });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(storageUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          file_id: 'file-uuid-123',
          file: expect.objectContaining({ originalname: 'upload.bin' }),
        }),
      );
      expect(createFile).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'plain extracted text',
          bytes: 128,
          filepath: '/uploads/user-123/file-uuid-123__upload.bin',
          source: FileSources.local,
          filename: 'upload.bin',
          type: 'text/plain',
          llmDeliveryPath: 'text',
        }),
        true,
      );
    });

    test('stores the original file durably for OCR delivery records', async () => {
      const { createFile } = require('~/models');
      const documentUpload = jest.fn().mockResolvedValue({
        text: 'ocr extracted text',
        bytes: 42,
        filepath: 'document_parser',
      });
      const storageUpload = jest.fn().mockResolvedValue({
        filepath: '/uploads/user-123/file-uuid-123__upload.bin',
        bytes: 4096,
        filename: 'upload.bin',
        embedded: false,
      });
      getStrategyFunctions.mockImplementation((source) => {
        if (source === FileSources.document_parser) {
          return { handleFileUpload: documentUpload };
        }
        return { handleFileUpload: storageUpload };
      });
      const req = makeReq({ mimetype: PDF_MIME, ocrConfig: null });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(documentUpload).toHaveBeenCalled();
      expect(storageUpload).toHaveBeenCalled();
      expect(createFile).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'ocr extracted text',
          bytes: 4096,
          filepath: '/uploads/user-123/file-uuid-123__upload.bin',
          source: FileSources.local,
          filename: 'upload.bin',
          type: PDF_MIME,
          llmDeliveryPath: 'text',
        }),
        true,
      );
    });
  });

  describe('explicit legacy tool delivery path', () => {
    test('persists llmDeliveryPath none for explicit file_search uploads', async () => {
      const { createFile } = require('~/models');
      const storageUpload = jest.fn().mockResolvedValue({
        filepath: '/uploads/user-123/file-uuid-123__upload.bin',
        bytes: 128,
        filename: 'upload.bin',
        embedded: false,
      });
      getStrategyFunctions.mockReturnValue({ handleFileUpload: storageUpload });
      mergeFileConfig.mockReturnValue({
        ...makeFileConfig(),
        defaultLLMDeliveryPath: {
          fallback: 'text',
        },
      });
      const req = makeReq({ mimetype: 'text/markdown', ocrConfig: null });

      await processAgentFileUpload({
        req,
        res: mockRes,
        metadata: {
          ...makeMetadata(),
          tool_resource: EToolResources.file_search,
        },
      });

      expect(checkCapability).toHaveBeenCalledWith(
        expect.anything(),
        AgentCapabilities.file_search,
      );
      expect(createFile).toHaveBeenCalledWith(
        expect.objectContaining({
          filepath: '/uploads/user-123/file-uuid-123__upload.bin',
          source: FileSources.local,
          type: 'text/markdown',
          embedded: true,
          llmDeliveryPath: 'none',
        }),
        true,
      );
    });

    test('persists llmDeliveryPath provider for legacy provider uploads without tool_resource', async () => {
      const { createFile } = require('~/models');
      const storageUpload = jest.fn().mockResolvedValue({
        filepath: '/uploads/user-123/file-uuid-123__upload.bin',
        bytes: 128,
        filename: 'upload.bin',
        embedded: false,
      });
      getStrategyFunctions.mockReturnValue({ handleFileUpload: storageUpload });
      mergeFileConfig.mockReturnValue({
        ...makeFileConfig(),
        legacyFileUploadUX: true,
        defaultLLMDeliveryPath: {
          fallback: 'none',
        },
      });
      const req = makeReq({ mimetype: 'text/markdown', ocrConfig: null });

      await processAgentFileUpload({
        req,
        res: mockRes,
        metadata: {
          agent_id: 'agent-abc',
          message_file: 'true',
          file_id: 'file-uuid-123',
        },
      });

      expect(createFile).toHaveBeenCalledWith(
        expect.objectContaining({
          filepath: '/uploads/user-123/file-uuid-123__upload.bin',
          source: FileSources.local,
          type: 'text/markdown',
          llmDeliveryPath: 'provider',
        }),
        true,
      );
    });

    test('persists llmDeliveryPath none for explicit execute_code uploads', async () => {
      const { createFile } = require('~/models');
      const codeUpload = jest.fn().mockResolvedValue('session-1/file.csv');
      const storageUpload = jest.fn().mockResolvedValue({
        filepath: '/uploads/user-123/file-uuid-123__upload.bin',
        bytes: 128,
        filename: 'upload.bin',
        embedded: false,
      });
      getStrategyFunctions.mockImplementation((source) => {
        if (source === FileSources.execute_code) {
          return { handleFileUpload: codeUpload };
        }
        return { handleFileUpload: storageUpload };
      });
      mergeFileConfig.mockReturnValue({
        ...makeFileConfig(),
        defaultLLMDeliveryPath: {
          fallback: 'text',
        },
      });
      const req = makeReq({ mimetype: 'text/csv', ocrConfig: null });
      req.file.path = __filename;

      await processAgentFileUpload({
        req,
        res: mockRes,
        metadata: {
          ...makeMetadata(),
          tool_resource: EToolResources.execute_code,
        },
      });

      expect(checkCapability).toHaveBeenCalledWith(
        expect.anything(),
        AgentCapabilities.execute_code,
      );
      expect(createFile).toHaveBeenCalledWith(
        expect.objectContaining({
          filepath: '/uploads/user-123/file-uuid-123__upload.bin',
          source: FileSources.local,
          type: 'text/csv',
          metadata: { fileIdentifier: 'session-1/file.csv' },
          llmDeliveryPath: 'none',
        }),
        true,
      );
    });

    test('persists llmDeliveryPath text for explicit context uploads', async () => {
      const { parseText } = require('@librechat/api');
      const { createFile } = require('~/models');
      const storageUpload = jest.fn().mockResolvedValue({
        filepath: '/uploads/user-123/file-uuid-123__upload.bin',
        bytes: 128,
        filename: 'upload.bin',
        embedded: false,
      });
      getStrategyFunctions.mockReturnValue({ handleFileUpload: storageUpload });
      mergeFileConfig.mockReturnValue(
        makeFileConfig({ textSupportedMimeTypes: ['text/markdown'] }),
      );
      parseText.mockResolvedValueOnce({ text: 'markdown text', bytes: 13 });
      const req = makeReq({ mimetype: 'text/markdown', ocrConfig: null });

      await processAgentFileUpload({
        req,
        res: mockRes,
        metadata: {
          ...makeMetadata(),
          tool_resource: EToolResources.context,
        },
      });

      expect(createFile).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'markdown text',
          filepath: '/uploads/user-123/file-uuid-123__upload.bin',
          source: FileSources.local,
          type: 'text/markdown',
          llmDeliveryPath: 'text',
        }),
        true,
      );
    });

    test('normalizes explicit ocr uploads to context text delivery', async () => {
      const { parseText } = require('@librechat/api');
      const { createFile, addAgentResourceFile } = require('~/models');
      const storageUpload = jest.fn().mockResolvedValue({
        filepath: '/uploads/user-123/file-uuid-123__upload.bin',
        bytes: 128,
        filename: 'upload.bin',
        embedded: false,
      });
      getStrategyFunctions.mockReturnValue({ handleFileUpload: storageUpload });
      mergeFileConfig.mockReturnValue(
        makeFileConfig({ textSupportedMimeTypes: ['text/markdown'] }),
      );
      parseText.mockResolvedValueOnce({ text: 'markdown text', bytes: 13 });
      const req = makeReq({ mimetype: 'text/markdown', ocrConfig: null });

      await processAgentFileUpload({
        req,
        res: mockRes,
        metadata: {
          ...makeMetadata(),
          tool_resource: EToolResources.ocr,
        },
      });

      expect(addAgentResourceFile).toHaveBeenCalledWith(
        expect.objectContaining({
          file_id: 'file-uuid-123',
          agent_id: 'agent-abc',
          tool_resource: EToolResources.context,
        }),
      );
      expect(createFile).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'markdown text',
          source: FileSources.local,
          type: 'text/markdown',
          llmDeliveryPath: 'text',
        }),
        true,
      );
    });
  });
});

describe('processImageFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRes.status.mockReturnThis();
    mockRes.json.mockReturnValue({});
    mergeFileConfig.mockReturnValue(makeFileConfig());
  });

  test('persists resolved llmDeliveryPath for image uploads', async () => {
    const { createFile } = require('~/models');
    const handleImageUpload = jest.fn().mockResolvedValue({
      filepath: '/images/user-123/image.webp',
      bytes: 256,
      width: 100,
      height: 80,
    });
    mergeFileConfig.mockReturnValue({
      ...makeFileConfig(),
      defaultLLMDeliveryPath: {
        overrides: { 'image/*': 'none' },
      },
    });
    getStrategyFunctions.mockReturnValue({ handleImageUpload });
    const req = makeReq({ mimetype: 'image/png', ocrConfig: null });

    await processImageFile({
      req,
      res: mockRes,
      metadata: {
        file_id: 'image-file-id',
        temp_file_id: 'temp-image-file-id',
        endpoint: EModelEndpoint.agents,
      },
    });

    expect(createFile).toHaveBeenCalledWith(
      expect.objectContaining({
        file_id: 'image-file-id',
        temp_file_id: 'temp-image-file-id',
        filepath: '/images/user-123/image.webp',
        source: FileSources.local,
        type: 'image/webp',
        llmDeliveryPath: 'none',
      }),
      true,
    );
  });

  test('persists provider llmDeliveryPath for legacy image provider uploads', async () => {
    const { createFile } = require('~/models');
    const handleImageUpload = jest.fn().mockResolvedValue({
      filepath: '/images/user-123/image.webp',
      bytes: 256,
      width: 100,
      height: 80,
    });
    mergeFileConfig.mockReturnValue({
      ...makeFileConfig(),
      legacyFileUploadUX: true,
      defaultLLMDeliveryPath: {
        overrides: { 'image/*': 'none' },
      },
    });
    getStrategyFunctions.mockReturnValue({ handleImageUpload });
    const req = makeReq({ mimetype: 'image/png', ocrConfig: null });

    await processImageFile({
      req,
      res: mockRes,
      metadata: {
        file_id: 'image-file-id',
        temp_file_id: 'temp-image-file-id',
        endpoint: EModelEndpoint.agents,
      },
    });

    expect(createFile).toHaveBeenCalledWith(
      expect.objectContaining({
        file_id: 'image-file-id',
        temp_file_id: 'temp-image-file-id',
        filepath: '/images/user-123/image.webp',
        source: FileSources.local,
        type: 'image/webp',
        llmDeliveryPath: 'provider',
      }),
      true,
    );
  });
});
