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
    RetentionMode: actual.RetentionMode ?? { ALL: 'all', TEMPORARY: 'temporary' },
    documentParserMimeTypes: actual.documentParserMimeTypes ?? [
      /^application\/pdf$/,
      /^application\/vnd\.openxmlformats-officedocument\./,
      /^application\/vnd\.ms-excel$/,
      /^application\/vnd\.oasis\.opendocument\./,
      /^application\/(?:x-)?msexcel$/,
    ],
    mergeFileConfig: jest.fn(),
  };
});

jest.mock('@librechat/api', () => {
  const actualDataProvider = jest.requireActual('librechat-data-provider');
  const RetentionMode = actualDataProvider.RetentionMode ?? { ALL: 'all', TEMPORARY: 'temporary' };
  const getRetentionExpiry = jest.fn(() => ({}));
  return {
    sanitizeFilename: jest.fn((n) => n),
    parseText: jest.fn().mockResolvedValue({ text: '', bytes: 0 }),
    parseTextNative: jest.fn().mockResolvedValue({ text: '', bytes: 0 }),
    processAudioFile: jest.fn(),
    sendUploadSuccess: jest.fn((res, sseStream, message, result) => {
      if (sseStream) {
        sseStream.sendData({ message, ...result });
        return;
      }
      res.status(200).json({ message, ...result });
    }),
    getStorageMetadata: jest.fn(() => ({})),
    /* Stub, deliberately not the production wording: the notice text is covered by
     * packages/api's own tests. What matters here is that process.js forwards the
     * pages it was given, so assertions target the call, not the string. */
    annotateMissingPages: jest.fn((text, pages) =>
      pages?.length ? `${text}\n[omitted:${pages.join(',')}]` : text,
    ),
    summarizeMissingPages: jest.fn((pages) => {
      const listed = pages.slice(0, 20);
      const remaining = pages.length - listed.length;
      return remaining ? `${listed.join(', ')} and ${remaining} more` : listed.join(', ');
    }),
    getRetentionExpiry,
    getAgentFileRetentionExpiry: jest.fn(({ req, messageAttachment, toolResource }) => {
      const interfaceConfig = req?.config?.interfaceConfig;
      if (
        !messageAttachment &&
        !!toolResource &&
        (interfaceConfig?.retentionMode !== RetentionMode.ALL ||
          interfaceConfig?.retainAgentFiles === true)
      ) {
        return {};
      }
      return getRetentionExpiry(req);
    }),
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
  uploadVectors: jest.fn().mockResolvedValue({
    bytes: 42,
    filename: 'upload.bin',
    filepath: 'vectordb',
    embedded: true,
  }),
  deleteVectors: jest.fn(),
}));

jest.mock('~/server/utils', () => ({
  determineFileType: jest.fn(),
}));

jest.mock('~/server/services/Files/Audio/STTService', () => ({
  STTService: { getInstance: jest.fn() },
}));

const {
  getRetentionExpiry,
  getAgentFileRetentionExpiry,
  annotateMissingPages,
  summarizeMissingPages,
  sweepExpiredFiles: sweepExpiredFilesWithDeps,
  startExpiredFileSweep: startExpiredFileSweepWithDeps,
} = require('@librechat/api');
const {
  EToolResources,
  FileSources,
  FileContext,
  RetentionMode,
  AgentCapabilities,
} = require('librechat-data-provider');
const { logger } = require('@librechat/data-schemas');
const { mergeFileConfig } = require('librechat-data-provider');
const { checkCapability } = require('~/server/services/Config');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { uploadVectors } = require('./VectorDB/crud');
const db = require('~/models');
const {
  filterFile,
  processAgentFileUpload,
  processDeleteRequest,
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

const makeReq = ({
  mimetype = PDF_MIME,
  originalname = 'upload.bin',
  ocrConfig = null,
  interfaceConfig,
  body,
} = {}) => ({
  user: { id: 'user-123', tenantId: 'tenant-a' },
  file: {
    path: '/tmp/upload.bin',
    originalname,
    filename: 'upload-uuid.bin',
    mimetype,
  },
  body: { model: 'gpt-4o', ...body },
  config: {
    fileConfig: {},
    fileStrategy: 'local',
    ocr: ocrConfig,
    ...(interfaceConfig ? { interfaceConfig } : {}),
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
  textSupportedMimeTypes = [],
  documentParserSupportedMimeTypes,
} = {}) => ({
  checkType: (mime, types) =>
    (types ?? []).some((t) => (typeof t === 'string' ? t === mime : t.test(mime))),
  ocr: { supportedMimeTypes: ocrSupportedMimeTypes },
  stt: { supportedMimeTypes: [] },
  text: { supportedMimeTypes: textSupportedMimeTypes },
  ...(documentParserSupportedMimeTypes
    ? { documentParser: { supportedMimeTypes: documentParserSupportedMimeTypes } }
    : {}),
});

const setupStoredFileUpload = (result = {}) => {
  const handleFileUpload = jest.fn().mockResolvedValue({
    bytes: 42,
    filename: 'upload.bin',
    filepath: '/uploads/upload.bin',
    ...result,
  });
  getStrategyFunctions.mockReturnValue({ handleFileUpload });
  return handleFileUpload;
};

describe('processAgentFileUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRes.status.mockReturnThis();
    mockRes.json.mockReturnValue({});
    checkCapability.mockResolvedValue(true);
    getStrategyFunctions.mockReturnValue({
      handleFileUpload: jest.fn().mockResolvedValue({
        text: 'extracted text',
        bytes: 42,
        filepath: FileSources.document_parser,
      }),
    });
    mergeFileConfig.mockReturnValue(makeFileConfig());
  });

  describe('local document extraction and OCR selection', () => {
    /**
     * AnyDoc has no page numbers to report, so a DOCX whose content is a scanned image
     * comes back looking complete. Embedded artwork is the signal that its Markdown may
     * be missing something, and a configured OCR service is exactly what recovers it.
     */
    test('escalates to configured OCR when the local parser reports embedded media', async () => {
      mergeFileConfig.mockReturnValue(makeFileConfig({ ocrSupportedMimeTypes: [DOCX_MIME] }));
      const localUpload = jest.fn().mockResolvedValue({
        text: 'text layer only',
        bytes: 15,
        filepath: FileSources.anydoc,
        mayEmbedMedia: true,
      });
      const remoteOCR = jest.fn().mockResolvedValue({
        text: 'text layer plus the scanned page',
        bytes: 31,
        filepath: FileSources.mistral_ocr,
      });
      getStrategyFunctions.mockImplementation((source) => ({
        handleFileUpload: source === FileSources.document_parser ? localUpload : remoteOCR,
      }));
      const req = makeReq({
        mimetype: DOCX_MIME,
        ocrConfig: { strategy: FileSources.mistral_ocr },
      });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(localUpload).toHaveBeenCalledTimes(1);
      expect(remoteOCR).toHaveBeenCalledTimes(1);
      expect(db.createFile.mock.calls[0][0].text).toBe('text layer plus the scanned page');
    });

    test('keeps the local text when embedded media is reported and no OCR is configured', async () => {
      getStrategyFunctions.mockReturnValue({
        handleFileUpload: jest.fn().mockResolvedValue({
          text: 'text layer only',
          bytes: 15,
          filepath: FileSources.anydoc,
          mayEmbedMedia: true,
        }),
      });
      const req = makeReq({ mimetype: DOCX_MIME, ocrConfig: null });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(checkCapability).not.toHaveBeenCalledWith(expect.anything(), AgentCapabilities.ocr);
      expect(db.createFile.mock.calls[0][0]).toEqual(
        expect.objectContaining({ text: 'text layer only', filepath: FileSources.anydoc }),
      );
    });

    test('does not escalate a document that embeds no media', async () => {
      mergeFileConfig.mockReturnValue(makeFileConfig({ ocrSupportedMimeTypes: [DOCX_MIME] }));
      const localUpload = jest.fn().mockResolvedValue({
        text: 'the whole document',
        bytes: 18,
        filepath: FileSources.anydoc,
      });
      const remoteOCR = jest.fn();
      getStrategyFunctions.mockImplementation((source) => ({
        handleFileUpload: source === FileSources.document_parser ? localUpload : remoteOCR,
      }));
      const req = makeReq({
        mimetype: DOCX_MIME,
        ocrConfig: { strategy: FileSources.mistral_ocr },
      });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(remoteOCR).not.toHaveBeenCalled();
      expect(db.createFile.mock.calls[0][0].text).toBe('the whole document');
    });

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

    test('routes a generic MIME through the parser when the filename identifies an allowed document', async () => {
      const req = makeReq({
        mimetype: 'application/octet-stream',
        originalname: 'report.docx',
        ocrConfig: null,
      });
      const { parseText } = require('@librechat/api');

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(getStrategyFunctions).toHaveBeenCalledWith(FileSources.document_parser);
      expect(parseText).not.toHaveBeenCalled();
      expect(db.createFile.mock.calls[0][0].type).toBe(DOCX_MIME);
    });

    /**
     * OOXML/ODF/EPUB documents are zip containers, so a client that types uploads by
     * content announces a `.docx` as an archive. That is not a generic type, so nothing
     * re-infers it, and the file used to miss every parser check and land in text
     * parsing, which stores the archive's bytes as the model's copy of the document.
     */
    test('routes a zip-typed office document through the parser on its extension', async () => {
      const req = makeReq({
        mimetype: 'application/zip',
        originalname: 'report.docx',
        ocrConfig: null,
      });
      const { parseText } = require('@librechat/api');

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(getStrategyFunctions).toHaveBeenCalledWith(FileSources.document_parser);
      expect(parseText).not.toHaveBeenCalled();
      expect(db.createFile.mock.calls[0][0].type).toBe(DOCX_MIME);
    });

    test('leaves an ordinary archive alone', async () => {
      mergeFileConfig.mockReturnValue(
        makeFileConfig({ textSupportedMimeTypes: [/^[\w.-]+\/[\w.-]+$/] }),
      );
      const req = makeReq({
        mimetype: 'application/zip',
        originalname: 'bundle.zip',
        ocrConfig: null,
      });
      const { parseText } = require('@librechat/api');
      parseText.mockResolvedValueOnce({ text: 'archive listing', bytes: 15 });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(getStrategyFunctions).not.toHaveBeenCalledWith(FileSources.document_parser);
      expect(parseText).toHaveBeenCalled();
    });

    /**
     * The parser only reformats a delimited file as a Markdown table, and the pipes and
     * padding it adds to every cell can push a source file inside the storage limit past
     * it. Failing the upload would lose a document whose bytes were readable all along.
     */
    test('stores the raw bytes when the parser cannot convert a delimited file', async () => {
      mergeFileConfig.mockReturnValue(
        makeFileConfig({ textSupportedMimeTypes: [/^[\w.-]+\/[\w.-]+$/] }),
      );
      getStrategyFunctions.mockReturnValue({
        handleFileUpload: jest
          .fn()
          .mockRejectedValue(
            new Error('anydoc failed: extracted 22MB of text, over the 15MB limit'),
          ),
      });
      const { parseText, parseTextNative } = require('@librechat/api');
      parseTextNative.mockResolvedValueOnce({ text: 'a,b\n1,2\n', bytes: 8 });
      const req = makeReq({ mimetype: 'text/csv', originalname: 'rows.csv', ocrConfig: null });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(db.createFile.mock.calls[0][0]).toEqual(
        expect.objectContaining({ text: 'a,b\n1,2\n', type: 'text/csv' }),
      );
      /* Read straight from disk: routing through the RAG path would spend a health check
       * and an extraction request to arrive back at the bytes, or return something else. */
      expect(parseText).not.toHaveBeenCalled();
    });

    /**
     * The same reformatting problem, reported as the refusal it is rather than swallowed.
     * The delimited file still falls back to its bytes; anything else has to surface,
     * since nothing downstream should rebuild the string the parser declined to hand over.
     */
    test('falls back to the bytes when a delimited conversion is refused on size', async () => {
      mergeFileConfig.mockReturnValue(
        makeFileConfig({ textSupportedMimeTypes: [/^[\w.-]+\/[\w.-]+$/] }),
      );
      const refusal = Object.assign(new Error('anydoc extracted 22MB of text'), {
        name: 'ParserOutputLimitError',
        code: 'PARSER_OUTPUT_LIMIT',
      });
      getStrategyFunctions.mockReturnValue({
        handleFileUpload: jest.fn().mockRejectedValue(refusal),
      });
      const { parseText, parseTextNative } = require('@librechat/api');
      parseTextNative.mockResolvedValueOnce({ text: 'a,b\n1,2\n', bytes: 8 });
      const req = makeReq({ mimetype: 'text/csv', originalname: 'rows.csv', ocrConfig: null });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(db.createFile.mock.calls[0][0].text).toBe('a,b\n1,2\n');
      expect(parseText).not.toHaveBeenCalled();
    });

    test('surfaces a size refusal for a document with no readable raw form', async () => {
      const refusal = Object.assign(new Error('pdf-inspector extracted 22MB of text'), {
        name: 'ParserOutputLimitError',
        code: 'PARSER_OUTPUT_LIMIT',
      });
      getStrategyFunctions.mockReturnValue({
        handleFileUpload: jest.fn().mockRejectedValue(refusal),
      });
      const { parseText } = require('@librechat/api');
      const req = makeReq({ mimetype: PDF_MIME, originalname: 'huge.pdf', ocrConfig: null });

      await expect(
        processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() }),
      ).rejects.toThrow('pdf-inspector extracted 22MB of text');
      expect(parseText).not.toHaveBeenCalled();
    });

    test('still refuses a binary document the parser cannot read', async () => {
      /* The counterpart: a DOCX has no readable raw form, so storing its bytes would
       * hand the model an archive. The refusal is the honest outcome there. */
      mergeFileConfig.mockReturnValue(
        makeFileConfig({ textSupportedMimeTypes: [/^[\w.-]+\/[\w.-]+$/] }),
      );
      getStrategyFunctions.mockReturnValue({
        handleFileUpload: jest.fn().mockRejectedValue(new Error('anydoc failed')),
      });
      const { parseText } = require('@librechat/api');
      const req = makeReq({ mimetype: DOCX_MIME, originalname: 'report.docx', ocrConfig: null });

      await expect(
        processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() }),
      ).rejects.toThrow(/Unable to extract text/);
      expect(parseText).not.toHaveBeenCalled();
    });

    test('does not check OCR capability when using automatic document_parser fallback', async () => {
      const req = makeReq({ mimetype: PDF_MIME, ocrConfig: null });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(checkCapability).not.toHaveBeenCalledWith(expect.anything(), AgentCapabilities.ocr);
      expect(getStrategyFunctions).toHaveBeenCalledWith(FileSources.document_parser);
    });

    test('annotates the stored text when the parser reports pages needing OCR', async () => {
      getStrategyFunctions.mockReturnValue({
        handleFileUpload: jest.fn().mockResolvedValue({
          text: 'page one text',
          bytes: 13,
          filepath: FileSources.document_parser,
          pagesNeedingOcr: [2, 3],
        }),
      });
      const req = makeReq({ mimetype: PDF_MIME, ocrConfig: null });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(annotateMissingPages).toHaveBeenCalledWith('page one text', [2, 3]);
      /* A part-scanned document must not be stored as if it were complete: the
       * persisted text carries the notice and bytes are recounted to match. */
      const created = db.createFile.mock.calls[0][0];
      expect(created.text).toBe('page one text\n[omitted:2,3]');
      expect(created.bytes).toBe(Buffer.byteLength(created.text, 'utf8'));
    });

    test('caps the missing-page list written to logs', async () => {
      const pagesNeedingOcr = Array.from({ length: 5000 }, (_, index) => index + 1);
      getStrategyFunctions.mockReturnValue({
        handleFileUpload: jest.fn().mockResolvedValue({
          text: 'partial text',
          bytes: 12,
          filepath: FileSources.document_parser,
          pagesNeedingOcr,
        }),
      });
      const req = makeReq({ mimetype: PDF_MIME, ocrConfig: null });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(summarizeMissingPages).toHaveBeenCalledWith(pagesNeedingOcr);
      const warning = logger.warn.mock.calls.find(([message]) =>
        message.includes('has no extractable text'),
      )?.[0];
      expect(warning).toContain('20 and 4980 more');
      expect(warning).not.toContain('21, 22');
      expect(warning.length).toBeLessThan(300);
    });

    test("stores the parsed record with the document's real MIME type", async () => {
      /* Stored as text/plain, the record forgets what kind of document it was,
       * and the client's extracted-text affordances key on that type. Model
       * routing is unaffected: BaseClient short-circuits on source === text. */
      const req = makeReq({ mimetype: PDF_MIME, ocrConfig: null });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(db.createFile.mock.calls[0][0].type).toBe(PDF_MIME);
    });

    test.each([FileSources.pdf_inspector, FileSources.anydoc])(
      'keeps the real MIME type for documents parsed by %s',
      async (marker) => {
        /* `filepath` is a provider marker, not a path. Matching only
         * `document_parser` would silently drop the MIME type for every other local
         * parser, and every client affordance that offers extracted text keys on it. */
        getStrategyFunctions.mockReturnValue({
          handleFileUpload: jest
            .fn()
            .mockResolvedValue({ text: 'parsed', bytes: 6, filepath: marker }),
        });
        const req = makeReq({ mimetype: PDF_MIME, ocrConfig: null });

        await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

        expect(db.createFile.mock.calls[0][0].type).toBe(PDF_MIME);
      },
    );

    test('an admin document-parser allowlist overrides the built-in defaults', async () => {
      /* The one extraction list that had no admin surface. Narrowing it must be able
       * to take a type out of the parser's reach, the same way `fileConfig.ocr` and
       * `fileConfig.text` already can. */
      mergeFileConfig.mockReturnValue(
        makeFileConfig({ documentParserSupportedMimeTypes: ['application/vnd.ms-excel'] }),
      );
      const req = makeReq({ mimetype: PDF_MIME, ocrConfig: null });

      await expect(
        processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() }),
      ).rejects.toThrow();
    });

    test('keeps the admin parser allowlist authoritative for a generic document MIME', async () => {
      mergeFileConfig.mockReturnValue(
        makeFileConfig({ documentParserSupportedMimeTypes: [PDF_MIME] }),
      );
      const req = makeReq({
        mimetype: 'application/octet-stream',
        originalname: 'report.docx',
        ocrConfig: null,
      });
      const { parseText } = require('@librechat/api');

      await expect(
        processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() }),
      ).rejects.toThrow(`File type ${DOCX_MIME} is not enabled for document parsing.`);

      expect(getStrategyFunctions).not.toHaveBeenCalled();
      expect(parseText).not.toHaveBeenCalled();
    });

    test('falls back to the built-in defaults when no admin allowlist is set', async () => {
      mergeFileConfig.mockReturnValue(makeFileConfig());
      const req = makeReq({ mimetype: PDF_MIME, ocrConfig: null });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(db.createFile.mock.calls[0][0].type).toBe(PDF_MIME);
    });

    test('keeps configured OCR results on text/plain for an image', async () => {
      const mime = 'image/png';
      mergeFileConfig.mockReturnValue(makeFileConfig({ ocrSupportedMimeTypes: [mime] }));
      getStrategyFunctions.mockReturnValue({
        handleFileUpload: jest.fn().mockResolvedValue({
          text: 'ocr text',
          bytes: 8,
          filepath: FileSources.mistral_ocr,
        }),
      });
      const req = makeReq({ mimetype: mime, ocrConfig: { strategy: FileSources.mistral_ocr } });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      /* Configured OCR stores a marker string as `filepath`, not a URL. Advertising the
       * original MIME type would make the client take its `image/*` branch and render
       * the marker as an <img> source. */
      const created = db.createFile.mock.calls[0][0];
      expect(created.type).toBe('text/plain');
      expect(created.filepath).toBe(FileSources.mistral_ocr);
    });

    test('keeps an OCR fallback result on text/plain for a partially readable PDF', async () => {
      mergeFileConfig.mockReturnValue(makeFileConfig({ ocrSupportedMimeTypes: [PDF_MIME] }));
      const localUpload = jest.fn().mockResolvedValue({
        text: 'local page one',
        bytes: 14,
        filepath: FileSources.pdf_inspector,
        pagesNeedingOcr: [2],
      });
      const remoteUpload = jest.fn().mockResolvedValue({
        text: 'OCR recovered both pages',
        bytes: 24,
        filepath: FileSources.mistral_ocr,
      });
      getStrategyFunctions.mockImplementation((source) => ({
        handleFileUpload: source === FileSources.document_parser ? localUpload : remoteUpload,
      }));
      const req = makeReq({
        mimetype: PDF_MIME,
        ocrConfig: { strategy: FileSources.mistral_ocr },
      });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      const created = db.createFile.mock.calls[0][0];
      expect(created.type).toBe('text/plain');
      expect(created.filepath).toBe(FileSources.mistral_ocr);
      expect(created.text).toBe('OCR recovered both pages');
    });

    test('leaves text and byte count untouched when every page was extracted', async () => {
      getStrategyFunctions.mockReturnValue({
        handleFileUpload: jest.fn().mockResolvedValue({
          text: 'complete text',
          bytes: 42,
          filepath: FileSources.document_parser,
        }),
      });
      const req = makeReq({ mimetype: PDF_MIME, ocrConfig: null });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      const created = db.createFile.mock.calls[0][0];
      expect(created.text).toBe('complete text');
      expect(created.bytes).toBe(42);
    });

    test('uses local document extraction before configured OCR for a text-based PDF', async () => {
      mergeFileConfig.mockReturnValue(makeFileConfig({ ocrSupportedMimeTypes: [PDF_MIME] }));
      const localUpload = jest.fn().mockResolvedValue({
        text: 'local PDF text',
        bytes: 14,
        filepath: FileSources.pdf_inspector,
      });
      const remoteOCR = jest.fn().mockResolvedValue({
        text: 'remote OCR text',
        bytes: 15,
        filepath: FileSources.mistral_ocr,
      });
      getStrategyFunctions.mockImplementation((source) => ({
        handleFileUpload: source === FileSources.document_parser ? localUpload : remoteOCR,
      }));
      const req = makeReq({
        mimetype: PDF_MIME,
        ocrConfig: { strategy: FileSources.mistral_ocr },
      });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(localUpload).toHaveBeenCalledTimes(1);
      expect(remoteOCR).not.toHaveBeenCalled();
      expect(checkCapability).not.toHaveBeenCalledWith(expect.anything(), AgentCapabilities.ocr);
      expect(db.createFile.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          text: 'local PDF text',
          filepath: FileSources.pdf_inspector,
          type: PDF_MIME,
        }),
      );
    });

    test.each([
      FileSources.mistral_ocr,
      FileSources.azure_mistral_ocr,
      FileSources.vertexai_mistral_ocr,
    ])(
      'uses configured OCR service %s after local extraction reports a missing page',
      async (strategy) => {
        mergeFileConfig.mockReturnValue(makeFileConfig({ ocrSupportedMimeTypes: [PDF_MIME] }));
        const localUpload = jest.fn().mockResolvedValue({
          text: 'local page one',
          bytes: 14,
          filepath: FileSources.pdf_inspector,
          pagesNeedingOcr: [2],
        });
        const remoteUpload = jest.fn().mockResolvedValue({
          text: 'OCR recovered both pages',
          bytes: 24,
          filepath: strategy,
        });
        getStrategyFunctions.mockImplementation((source) => ({
          handleFileUpload: source === FileSources.document_parser ? localUpload : remoteUpload,
        }));
        const req = makeReq({
          mimetype: PDF_MIME,
          ocrConfig: { strategy },
        });

        await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

        expect(getStrategyFunctions).toHaveBeenNthCalledWith(1, FileSources.document_parser);
        expect(getStrategyFunctions).toHaveBeenNthCalledWith(2, strategy);
        expect(localUpload).toHaveBeenCalledTimes(1);
        expect(remoteUpload).toHaveBeenCalledTimes(1);
        expect(checkCapability).toHaveBeenCalledWith(expect.anything(), AgentCapabilities.ocr);
      },
    );

    test('defaults missing OCR strategy to Mistral after local extraction needs OCR', async () => {
      mergeFileConfig.mockReturnValue(makeFileConfig({ ocrSupportedMimeTypes: [PDF_MIME] }));
      const localUpload = jest.fn().mockRejectedValue(new Error('No text found in document'));
      const remoteUpload = jest.fn().mockResolvedValue({
        text: 'OCR text',
        bytes: 8,
        filepath: FileSources.mistral_ocr,
      });
      getStrategyFunctions.mockImplementation((source) => ({
        handleFileUpload: source === FileSources.document_parser ? localUpload : remoteUpload,
      }));
      const req = makeReq({
        mimetype: PDF_MIME,
        ocrConfig: { supportedMimeTypes: [PDF_MIME] },
      });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(checkCapability).toHaveBeenCalledWith(expect.anything(), AgentCapabilities.ocr);
      expect(getStrategyFunctions).toHaveBeenNthCalledWith(1, FileSources.document_parser);
      expect(getStrategyFunctions).toHaveBeenNthCalledWith(2, FileSources.mistral_ocr);
    });

    test('throws when OCR is needed but the agent capability is not enabled', async () => {
      mergeFileConfig.mockReturnValue(makeFileConfig({ ocrSupportedMimeTypes: [PDF_MIME] }));
      checkCapability.mockResolvedValue(false);
      getStrategyFunctions.mockReturnValue({
        handleFileUpload: jest.fn().mockRejectedValue(new Error('No text found in document')),
      });
      const req = makeReq({
        mimetype: PDF_MIME,
        ocrConfig: { strategy: FileSources.mistral_ocr },
      });

      await expect(
        processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() }),
      ).rejects.toThrow('OCR capability is not enabled for Agents');
    });

    test('preserves partial local text when configured OCR capability is not enabled', async () => {
      mergeFileConfig.mockReturnValue(makeFileConfig({ ocrSupportedMimeTypes: [PDF_MIME] }));
      checkCapability.mockResolvedValue(false);
      const localUpload = jest.fn().mockResolvedValue({
        text: 'local page one',
        bytes: 14,
        filepath: FileSources.pdf_inspector,
        pagesNeedingOcr: [2],
      });
      const remoteUpload = jest.fn().mockResolvedValue({
        text: 'remote OCR text',
        bytes: 15,
        filepath: FileSources.mistral_ocr,
      });
      getStrategyFunctions.mockImplementation((source) => ({
        handleFileUpload: source === FileSources.document_parser ? localUpload : remoteUpload,
      }));
      const req = makeReq({
        mimetype: PDF_MIME,
        ocrConfig: { strategy: FileSources.mistral_ocr },
      });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(checkCapability).toHaveBeenCalledWith(expect.anything(), AgentCapabilities.ocr);
      expect(remoteUpload).not.toHaveBeenCalled();
      expect(db.createFile.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          text: 'local page one\n[omitted:2]',
          filepath: FileSources.pdf_inspector,
          type: PDF_MIME,
        }),
      );
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
    ])('extracts %s locally before considering configured OCR', async (_, mime) => {
      mergeFileConfig.mockReturnValue(
        makeFileConfig({
          ocrSupportedMimeTypes: [mime],
          documentParserSupportedMimeTypes: [mime],
        }),
      );
      const req = makeReq({
        mimetype: mime,
        ocrConfig: { strategy: FileSources.mistral_ocr },
      });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(getStrategyFunctions).toHaveBeenCalledWith(FileSources.document_parser);
      expect(getStrategyFunctions).not.toHaveBeenCalledWith(FileSources.mistral_ocr);
      expect(checkCapability).not.toHaveBeenCalledWith(expect.anything(), AgentCapabilities.ocr);
    });

    test('routes ODG directly through configured OCR because it is not a local document type', async () => {
      mergeFileConfig.mockReturnValue(makeFileConfig({ ocrSupportedMimeTypes: [ODG_MIME] }));
      getStrategyFunctions.mockReturnValue({
        handleFileUpload: jest.fn().mockResolvedValue({
          text: 'OCR text',
          bytes: 8,
          filepath: FileSources.mistral_ocr,
        }),
      });
      const req = makeReq({
        mimetype: ODG_MIME,
        ocrConfig: { strategy: FileSources.mistral_ocr },
      });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(checkCapability).toHaveBeenCalledWith(expect.anything(), AgentCapabilities.ocr);
      expect(getStrategyFunctions).toHaveBeenCalledTimes(1);
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

    test('uses configured OCR when local extraction fails for a document MIME type', async () => {
      mergeFileConfig.mockReturnValue(makeFileConfig({ ocrSupportedMimeTypes: [PDF_MIME] }));
      const localUpload = jest.fn().mockRejectedValue(new Error('No text found in document'));
      const remoteUpload = jest.fn().mockResolvedValue({
        text: 'OCR text',
        bytes: 8,
        filepath: FileSources.mistral_ocr,
      });
      getStrategyFunctions.mockImplementation((source) => ({
        handleFileUpload: source === FileSources.document_parser ? localUpload : remoteUpload,
      }));
      const req = makeReq({
        mimetype: PDF_MIME,
        ocrConfig: { strategy: FileSources.mistral_ocr },
      });

      await expect(
        processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() }),
      ).resolves.not.toThrow();

      expect(getStrategyFunctions).toHaveBeenNthCalledWith(1, FileSources.document_parser);
      expect(getStrategyFunctions).toHaveBeenNthCalledWith(2, FileSources.mistral_ocr);
      expect(db.createFile.mock.calls[0][0]).toEqual(
        expect.objectContaining({ text: 'OCR text', filepath: FileSources.mistral_ocr }),
      );
    });

    test('propagates a ZIP-bomb refusal without sending the archive to configured OCR', async () => {
      mergeFileConfig.mockReturnValue(makeFileConfig({ ocrSupportedMimeTypes: [DOCX_MIME] }));
      const zipBombError = Object.assign(new Error('zip bomb suspected'), {
        name: 'ZipBombError',
        code: 'ZIP_BOMB',
      });
      const localUpload = jest.fn().mockRejectedValue(zipBombError);
      const remoteUpload = jest.fn().mockResolvedValue({
        text: 'remote OCR text',
        bytes: 15,
        filepath: FileSources.mistral_ocr,
      });
      getStrategyFunctions.mockImplementation((source) => ({
        handleFileUpload: source === FileSources.document_parser ? localUpload : remoteUpload,
      }));
      const req = makeReq({
        mimetype: DOCX_MIME,
        originalname: 'hostile.docx',
        ocrConfig: { strategy: FileSources.mistral_ocr },
      });

      await expect(
        processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() }),
      ).rejects.toBe(zipBombError);

      expect(localUpload).toHaveBeenCalledTimes(1);
      expect(remoteUpload).not.toHaveBeenCalled();
      expect(checkCapability).not.toHaveBeenCalledWith(expect.anything(), AgentCapabilities.ocr);
    });

    test('propagates a PDF page-limit refusal without sending the PDF to configured OCR', async () => {
      mergeFileConfig.mockReturnValue(makeFileConfig({ ocrSupportedMimeTypes: [PDF_MIME] }));
      const pageLimitError = Object.assign(
        new Error('PDF contains 4000 pages, exceeding the 250-page fallback limit'),
        {
          name: 'PdfPageLimitError',
          code: 'PDF_PAGE_LIMIT',
        },
      );
      const localUpload = jest.fn().mockRejectedValue(pageLimitError);
      const remoteUpload = jest.fn().mockResolvedValue({
        text: 'remote OCR text',
        bytes: 15,
        filepath: FileSources.mistral_ocr,
      });
      getStrategyFunctions.mockImplementation((source) => ({
        handleFileUpload: source === FileSources.document_parser ? localUpload : remoteUpload,
      }));
      const req = makeReq({
        mimetype: PDF_MIME,
        originalname: 'page-flood.pdf',
        ocrConfig: { strategy: FileSources.mistral_ocr },
      });

      await expect(
        processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() }),
      ).rejects.toBe(pageLimitError);

      expect(localUpload).toHaveBeenCalledTimes(1);
      expect(remoteUpload).not.toHaveBeenCalled();
      expect(checkCapability).not.toHaveBeenCalledWith(expect.anything(), AgentCapabilities.ocr);
    });

    test('does not bypass the document-parser allowlist when configured OCR fails', async () => {
      mergeFileConfig.mockReturnValue(
        makeFileConfig({
          ocrSupportedMimeTypes: [PDF_MIME],
          documentParserSupportedMimeTypes: [DOCX_MIME],
        }),
      );
      const failingUpload = jest.fn().mockRejectedValue(new Error('OCR API returned 500'));
      getStrategyFunctions.mockReturnValue({ handleFileUpload: failingUpload });
      const req = makeReq({
        mimetype: PDF_MIME,
        ocrConfig: { strategy: FileSources.mistral_ocr },
      });

      await expect(
        processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() }),
      ).rejects.toThrow(/configured OCR service/);

      expect(getStrategyFunctions).toHaveBeenCalledWith(FileSources.mistral_ocr);
      expect(getStrategyFunctions).not.toHaveBeenCalledWith(FileSources.document_parser);
    });

    test('throws when both local extraction and configured OCR fail', async () => {
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

  describe('configured text (RAG) routing for document MIME types', () => {
    const DOCX_TEXT_REGEX = [
      /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$/,
    ];
    let originalRagUrl;

    beforeEach(() => {
      originalRagUrl = process.env.RAG_API_URL;
    });

    afterEach(() => {
      if (originalRagUrl === undefined) {
        delete process.env.RAG_API_URL;
      } else {
        process.env.RAG_API_URL = originalRagUrl;
      }
    });

    test('routes a document type to RAG /text (no native fallback) when admin narrows text config and RAG is set', async () => {
      process.env.RAG_API_URL = 'http://rag-api.test';
      mergeFileConfig.mockReturnValue(makeFileConfig({ textSupportedMimeTypes: DOCX_TEXT_REGEX }));
      const { parseText } = require('@librechat/api');
      parseText.mockResolvedValueOnce({ text: 'rag extracted', bytes: 13 });
      const req = makeReq({ mimetype: DOCX_MIME, ocrConfig: null });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(parseText).toHaveBeenCalledWith(
        expect.objectContaining({ allowNativeFallback: false }),
      );
      expect(getStrategyFunctions).not.toHaveBeenCalledWith(FileSources.document_parser);
    });

    /**
     * Naming a type in the text allowlist while removing it from the parser allowlist is
     * how an admin says "RAG handles this one". Reading local-parser eligibility to decide
     * the RAG route turned that pair of settings into a refused upload.
     */
    test('routes to RAG /text for a type the admin removed from the local parser', async () => {
      process.env.RAG_API_URL = 'http://rag-api.test';
      mergeFileConfig.mockReturnValue(
        makeFileConfig({
          textSupportedMimeTypes: DOCX_TEXT_REGEX,
          documentParserSupportedMimeTypes: [/^application\/pdf$/],
        }),
      );
      const { parseText } = require('@librechat/api');
      parseText.mockResolvedValueOnce({ text: 'rag extracted', bytes: 13 });
      const req = makeReq({ mimetype: DOCX_MIME, ocrConfig: null });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(parseText).toHaveBeenCalledWith(
        expect.objectContaining({ allowNativeFallback: false }),
      );
      expect(db.createFile.mock.calls[0][0].text).toBe('rag extracted');
    });

    test('keeps the built-in document parser when text config is the permissive default', async () => {
      process.env.RAG_API_URL = 'http://rag-api.test';
      mergeFileConfig.mockReturnValue(
        makeFileConfig({ textSupportedMimeTypes: [/^[\w.-]+\/[\w.-]+$/] }),
      );
      const { parseText } = require('@librechat/api');
      const req = makeReq({ mimetype: DOCX_MIME, ocrConfig: null });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(getStrategyFunctions).toHaveBeenCalledWith(FileSources.document_parser);
      expect(parseText).not.toHaveBeenCalled();
    });

    test('keeps the built-in document parser when RAG_API_URL is not configured', async () => {
      delete process.env.RAG_API_URL;
      mergeFileConfig.mockReturnValue(makeFileConfig({ textSupportedMimeTypes: DOCX_TEXT_REGEX }));
      const { parseText } = require('@librechat/api');
      const req = makeReq({ mimetype: DOCX_MIME, ocrConfig: null });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(getStrategyFunctions).toHaveBeenCalledWith(FileSources.document_parser);
      expect(parseText).not.toHaveBeenCalled();
    });

    test('falls back to the built-in document parser (not native text) when RAG is unavailable', async () => {
      process.env.RAG_API_URL = 'http://rag-api.test';
      mergeFileConfig.mockReturnValue(makeFileConfig({ textSupportedMimeTypes: DOCX_TEXT_REGEX }));
      const { parseText } = require('@librechat/api');
      parseText.mockRejectedValueOnce(new Error('native fallback is disabled'));
      const req = makeReq({ mimetype: DOCX_MIME, ocrConfig: null });

      await expect(
        processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() }),
      ).resolves.not.toThrow();

      expect(parseText).toHaveBeenCalledWith(
        expect.objectContaining({ allowNativeFallback: false }),
      );
      expect(getStrategyFunctions).toHaveBeenCalledWith(FileSources.document_parser);
    });

    test('annotates omitted pages and keeps the real MIME type on the RAG fallback', async () => {
      process.env.RAG_API_URL = 'http://rag-api.test';
      mergeFileConfig.mockReturnValue(makeFileConfig({ textSupportedMimeTypes: DOCX_TEXT_REGEX }));
      const { parseText } = require('@librechat/api');
      parseText.mockRejectedValueOnce(new Error('native fallback is disabled'));
      getStrategyFunctions.mockReturnValue({
        handleFileUpload: jest.fn().mockResolvedValue({
          text: 'page one text',
          bytes: 13,
          filepath: FileSources.document_parser,
          pagesNeedingOcr: [2, 3],
        }),
      });
      const req = makeReq({ mimetype: DOCX_MIME, ocrConfig: null });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      /* Identical parser output must be stored identically whichever branch consumed it:
       * the fallback used to drop the omitted pages and the document's MIME type. */
      expect(annotateMissingPages).toHaveBeenCalledWith('page one text', [2, 3]);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('page(s) 2, 3'));
      const created = db.createFile.mock.calls[0][0];
      expect(created.text).toBe('page one text\n[omitted:2,3]');
      expect(created.bytes).toBe(Buffer.byteLength(created.text, 'utf8'));
      expect(created.type).toBe(DOCX_MIME);
    });

    test('surfaces a persistence failure without retrying via the document parser', async () => {
      process.env.RAG_API_URL = 'http://rag-api.test';
      mergeFileConfig.mockReturnValue(makeFileConfig({ textSupportedMimeTypes: DOCX_TEXT_REGEX }));
      const { parseText } = require('@librechat/api');
      parseText.mockResolvedValueOnce({ text: 'rag extracted', bytes: 13 });
      // RAG extraction succeeds, but persisting the result fails.
      db.createFile.mockRejectedValueOnce(new Error('DB down'));
      const req = makeReq({ mimetype: DOCX_MIME, ocrConfig: null });

      await expect(
        processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() }),
      ).rejects.toThrow('DB down');

      // The persistence failure must not trigger a second extraction via the built-in parser.
      expect(getStrategyFunctions).not.toHaveBeenCalledWith(FileSources.document_parser);
    });
  });

  describe('text size guard', () => {
    test('throws before writing to MongoDB when extracted text exceeds 15MB', async () => {
      const oversizedText = 'x'.repeat(15 * 1024 * 1024 + 1);
      getStrategyFunctions.mockReturnValue({
        handleFileUpload: jest.fn().mockResolvedValue({
          text: oversizedText,
          bytes: Buffer.byteLength(oversizedText, 'utf8'),
          filepath: FileSources.document_parser,
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
          filepath: FileSources.document_parser,
        }),
      });
      const req = makeReq({ mimetype: PDF_MIME, ocrConfig: null });

      await expect(
        processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() }),
      ).resolves.not.toThrow();
    });
  });

  describe('retention for agent resource uploads', () => {
    test('skips retention metadata for persistent agent context files outside all-data retention when retainAgentFiles is disabled', async () => {
      const expiredAt = new Date('2030-01-01T00:00:00.000Z');
      const req = makeReq({
        mimetype: PDF_MIME,
        ocrConfig: null,
        interfaceConfig: { retentionMode: RetentionMode.TEMPORARY, retainAgentFiles: false },
        body: { conversationId: 'temporary-convo', isTemporary: true },
      });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(getAgentFileRetentionExpiry).toHaveBeenCalledWith(
        {
          req,
          messageAttachment: false,
          toolResource: EToolResources.context,
        },
        expect.any(Object),
      );
      expect(getRetentionExpiry).not.toHaveBeenCalled();
      expect(db.createFile).toHaveBeenCalledWith(expect.not.objectContaining({ expiredAt }), true);
      expect(db.addAgentResourceFile).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: 'agent-abc',
          tool_resource: EToolResources.context,
        }),
      );
    });

    test('skips retention metadata for persistent agent context files outside all-data retention when retainAgentFiles is enabled', async () => {
      const expiredAt = new Date('2030-01-01T00:00:00.000Z');
      const req = makeReq({
        mimetype: PDF_MIME,
        ocrConfig: null,
        interfaceConfig: { retentionMode: RetentionMode.TEMPORARY, retainAgentFiles: true },
      });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(getRetentionExpiry).not.toHaveBeenCalled();
      expect(db.createFile).toHaveBeenCalledWith(expect.not.objectContaining({ expiredAt }), true);
      expect(db.addAgentResourceFile).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: 'agent-abc',
          tool_resource: EToolResources.context,
        }),
      );
    });

    test('applies all-data retention metadata to persistent agent context files when retainAgentFiles is disabled', async () => {
      const expiredAt = new Date('2030-01-01T00:00:00.000Z');
      getRetentionExpiry.mockResolvedValueOnce({ expiredAt });
      const req = makeReq({
        mimetype: PDF_MIME,
        ocrConfig: null,
        interfaceConfig: { retentionMode: RetentionMode.ALL, retainAgentFiles: false },
      });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(getRetentionExpiry).toHaveBeenCalledTimes(1);
      expect(getRetentionExpiry.mock.calls[0][0]).toBe(req);
      expect(db.createFile).toHaveBeenCalledWith(
        expect.objectContaining({
          expiredAt,
          context: FileContext.agents,
        }),
        true,
      );
      expect(db.addAgentResourceFile).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: 'agent-abc',
          tool_resource: EToolResources.context,
        }),
      );
    });

    test('skips all-data retention metadata for persistent agent context files when retainAgentFiles is enabled', async () => {
      const expiredAt = new Date('2030-01-01T00:00:00.000Z');
      const req = makeReq({
        mimetype: PDF_MIME,
        ocrConfig: null,
        interfaceConfig: { retentionMode: RetentionMode.ALL, retainAgentFiles: true },
      });

      await processAgentFileUpload({ req, res: mockRes, metadata: makeMetadata() });

      expect(getAgentFileRetentionExpiry).toHaveBeenCalledWith(
        {
          req,
          messageAttachment: false,
          toolResource: EToolResources.context,
        },
        expect.any(Object),
      );
      expect(getRetentionExpiry).not.toHaveBeenCalled();
      expect(db.createFile).toHaveBeenCalledWith(
        expect.objectContaining({
          context: FileContext.agents,
        }),
        true,
      );
      expect(db.createFile).toHaveBeenCalledWith(expect.not.objectContaining({ expiredAt }), true);
      expect(db.addAgentResourceFile).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: 'agent-abc',
          tool_resource: EToolResources.context,
        }),
      );
    });

    test('applies retention metadata to context files uploaded as message attachments', async () => {
      const expiredAt = new Date('2030-01-01T00:00:00.000Z');
      getRetentionExpiry.mockResolvedValueOnce({ expiredAt });
      const req = makeReq({ mimetype: PDF_MIME, ocrConfig: null });

      await processAgentFileUpload({
        req,
        res: mockRes,
        metadata: { ...makeMetadata(), message_file: true },
      });

      expect(getRetentionExpiry).toHaveBeenCalledTimes(1);
      expect(getRetentionExpiry.mock.calls[0][0]).toBe(req);
      expect(db.createFile).toHaveBeenCalledWith(
        expect.objectContaining({
          expiredAt,
          context: FileContext.message_attachment,
        }),
        true,
      );
      expect(db.addAgentResourceFile).not.toHaveBeenCalled();
    });

    test('skips retention metadata for persistent agent file-search files outside all-data retention', async () => {
      const expiredAt = new Date('2030-01-01T00:00:00.000Z');
      setupStoredFileUpload();
      const req = makeReq({ mimetype: 'text/plain', ocrConfig: null });

      await processAgentFileUpload({
        req,
        res: mockRes,
        metadata: { ...makeMetadata(), tool_resource: EToolResources.file_search },
      });

      expect(uploadVectors).toHaveBeenCalled();
      expect(getRetentionExpiry).not.toHaveBeenCalled();
      expect(db.createFile).toHaveBeenCalledWith(expect.not.objectContaining({ expiredAt }), true);
      expect(db.addAgentResourceFile).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: 'agent-abc',
          tool_resource: EToolResources.file_search,
        }),
      );
    });

    test('applies all-data retention metadata to persistent agent file-search files', async () => {
      const expiredAt = new Date('2030-01-01T00:00:00.000Z');
      getRetentionExpiry.mockResolvedValueOnce({ expiredAt });
      setupStoredFileUpload();
      const req = makeReq({
        mimetype: 'text/plain',
        ocrConfig: null,
        interfaceConfig: { retentionMode: RetentionMode.ALL },
      });

      await processAgentFileUpload({
        req,
        res: mockRes,
        metadata: { ...makeMetadata(), tool_resource: EToolResources.file_search },
      });

      expect(uploadVectors).toHaveBeenCalled();
      expect(getRetentionExpiry).toHaveBeenCalledTimes(1);
      expect(getRetentionExpiry.mock.calls[0][0]).toBe(req);
      expect(db.createFile).toHaveBeenCalledWith(
        expect.objectContaining({
          expiredAt,
          context: FileContext.agents,
        }),
        true,
      );
      expect(db.addAgentResourceFile).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: 'agent-abc',
          tool_resource: EToolResources.file_search,
        }),
      );
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
              executionProfile: 'default',
            },
            codeEnvRefs: {
              default: {
                kind: 'user',
                id: 'user-123',
                storage_session_id: 'sess-1',
                file_id: 'fid-1',
                executionProfile: 'default',
              },
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
              executionProfile: 'default',
            },
            codeEnvRefs: {
              default: {
                kind: 'agent',
                id: 'agent-abc',
                storage_session_id: 'sess-2',
                file_id: 'fid-2',
                executionProfile: 'default',
              },
            },
          },
        }),
        true,
      );
    });

    it('skips retention metadata for persistent agent execute_code files outside all-data retention', async () => {
      const expiredAt = new Date('2030-01-01T00:00:00.000Z');
      setupCodeEnvUpload({ storage_session_id: 'sess-4', file_id: 'fid-4' });
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

      expect(getRetentionExpiry).not.toHaveBeenCalled();
      expect(db.createFile).toHaveBeenCalledWith(expect.not.objectContaining({ expiredAt }), true);
      expect(db.addAgentResourceFile).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: 'agent-abc',
          tool_resource: EToolResources.execute_code,
        }),
      );
    });

    it('applies all-data retention metadata to persistent agent execute_code files', async () => {
      const expiredAt = new Date('2030-01-01T00:00:00.000Z');
      getRetentionExpiry.mockResolvedValueOnce({ expiredAt });
      setupCodeEnvUpload({ storage_session_id: 'sess-5', file_id: 'fid-5' });
      const req = makeReq({ interfaceConfig: { retentionMode: RetentionMode.ALL } });

      await processAgentFileUpload({
        req,
        res: mockRes,
        metadata: {
          agent_id: 'agent-abc',
          tool_resource: EToolResources.execute_code,
          file_id: 'file-uuid',
        },
      });

      expect(getRetentionExpiry).toHaveBeenCalledTimes(1);
      expect(getRetentionExpiry.mock.calls[0][0]).toBe(req);
      expect(db.createFile).toHaveBeenCalledWith(
        expect.objectContaining({
          expiredAt,
          context: FileContext.agents,
          metadata: {
            codeEnvRef: {
              kind: 'agent',
              id: 'agent-abc',
              storage_session_id: 'sess-5',
              file_id: 'fid-5',
              executionProfile: 'default',
            },
            codeEnvRefs: {
              default: {
                kind: 'agent',
                id: 'agent-abc',
                storage_session_id: 'sess-5',
                file_id: 'fid-5',
                executionProfile: 'default',
              },
            },
          },
        }),
        true,
      );
      expect(db.addAgentResourceFile).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: 'agent-abc',
          tool_resource: EToolResources.execute_code,
        }),
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
        config: { interfaceConfig: { retentionMode: 'all', retainAgentFiles: true } },
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

  it('deletes vector storage before removing embedded file metadata', async () => {
    const primaryDelete = jest.fn().mockResolvedValue(undefined);
    const vectorDelete = jest.fn().mockResolvedValue(undefined);
    getStrategyFunctions.mockImplementation((source) =>
      source === FileSources.vectordb
        ? { deleteFile: vectorDelete }
        : { deleteFile: primaryDelete },
    );
    db.deleteFiles.mockResolvedValue({ deletedCount: 1 });
    const req = {
      body: {},
      config: {},
      user: { id: 'user-123', tenantId: 'tenant-a' },
    };
    const file = {
      file_id: 'embedded-file',
      filepath: '/uploads/embedded.txt',
      source: FileSources.local,
      embedded: true,
    };

    const result = await processDeleteRequest({ req, files: [file] });

    expect(primaryDelete).toHaveBeenCalledWith(req, file, undefined);
    expect(vectorDelete).toHaveBeenCalledWith(req, file);
    expect(db.deleteFiles).toHaveBeenCalledWith(['embedded-file']);
    expect(result).toEqual({ deletedFileIds: ['embedded-file'], failedFileIds: [] });
  });

  it('keeps embedded file metadata when vector deletion fails', async () => {
    const primaryDelete = jest.fn().mockResolvedValue(undefined);
    const vectorDelete = jest.fn().mockRejectedValue(new Error('rag unavailable'));
    getStrategyFunctions.mockImplementation((source) =>
      source === FileSources.vectordb
        ? { deleteFile: vectorDelete }
        : { deleteFile: primaryDelete },
    );
    const req = {
      body: {},
      config: {},
      user: { id: 'user-123', tenantId: 'tenant-a' },
    };
    const file = {
      file_id: 'embedded-file',
      filepath: '/uploads/embedded.txt',
      source: FileSources.local,
      embedded: true,
    };

    const result = await processDeleteRequest({ req, files: [file] });

    expect(primaryDelete).toHaveBeenCalledWith(req, file, undefined);
    expect(vectorDelete).toHaveBeenCalledWith(req, file);
    expect(db.deleteFiles).not.toHaveBeenCalled();
    expect(result).toEqual({ deletedFileIds: [], failedFileIds: ['embedded-file'] });
  });

  it('does not delete vector storage when primary embedded file deletion fails', async () => {
    const primaryDelete = jest.fn().mockRejectedValue(new Error('permission denied'));
    const vectorDelete = jest.fn().mockResolvedValue(undefined);
    getStrategyFunctions.mockImplementation((source) =>
      source === FileSources.vectordb
        ? { deleteFile: vectorDelete }
        : { deleteFile: primaryDelete },
    );
    const req = {
      body: {},
      config: {},
      user: { id: 'user-123', tenantId: 'tenant-a' },
    };
    const file = {
      file_id: 'embedded-file',
      filepath: '/uploads/embedded.txt',
      source: FileSources.local,
      embedded: true,
    };

    const result = await processDeleteRequest({ req, files: [file] });

    expect(primaryDelete).toHaveBeenCalledWith(req, file, undefined);
    expect(vectorDelete).not.toHaveBeenCalled();
    expect(db.deleteFiles).not.toHaveBeenCalled();
    expect(result).toEqual({ deletedFileIds: [], failedFileIds: ['embedded-file'] });
  });

  it('still deletes vector storage when primary embedded file storage is already missing', async () => {
    const missingError = Object.assign(new Error('no such file'), { code: 'ENOENT' });
    const primaryDelete = jest.fn().mockRejectedValue(missingError);
    const vectorDelete = jest.fn().mockResolvedValue(undefined);
    getStrategyFunctions.mockImplementation((source) =>
      source === FileSources.vectordb
        ? { deleteFile: vectorDelete }
        : { deleteFile: primaryDelete },
    );
    db.deleteFiles.mockResolvedValue({ deletedCount: 1 });
    const req = {
      body: {},
      config: {},
      user: { id: 'user-123', tenantId: 'tenant-a' },
    };
    const file = {
      file_id: 'embedded-file',
      filepath: '/uploads/embedded.txt',
      source: FileSources.local,
      embedded: true,
    };

    const result = await processDeleteRequest({ req, files: [file] });

    expect(primaryDelete).toHaveBeenCalledWith(req, file, undefined);
    expect(vectorDelete).toHaveBeenCalledWith(req, file);
    expect(db.deleteFiles).toHaveBeenCalledWith(['embedded-file']);
    expect(result).toEqual({ deletedFileIds: ['embedded-file'], failedFileIds: [] });
  });

  it('deletes code environment storage before removing code resource file metadata', async () => {
    const primaryDelete = jest.fn().mockResolvedValue(undefined);
    const codeDelete = jest.fn().mockResolvedValue(undefined);
    getStrategyFunctions.mockImplementation((source) =>
      source === FileSources.execute_code
        ? { deleteFile: codeDelete }
        : { deleteFile: primaryDelete },
    );
    db.deleteFiles.mockResolvedValue({ deletedCount: 1 });
    const req = {
      body: {},
      config: {},
      user: { id: 'user-123', tenantId: 'tenant-a' },
    };
    const file = {
      file_id: 'code-resource-file',
      filepath: '/uploads/code-resource.txt',
      source: FileSources.local,
      metadata: {
        codeEnvRef: {
          kind: 'agent',
          id: 'agent-abc',
          storage_session_id: 'sess-1',
          file_id: 'fid-1',
        },
      },
    };

    const result = await processDeleteRequest({ req, files: [file] });

    expect(primaryDelete).toHaveBeenCalledWith(req, file, undefined);
    expect(codeDelete).toHaveBeenCalledWith(req, file);
    expect(db.deleteFiles).toHaveBeenCalledWith(['code-resource-file']);
    expect(result).toEqual({ deletedFileIds: ['code-resource-file'], failedFileIds: [] });
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

/**
 * The authoritative MIME gate. Multer's filter runs while the file part is still
 * streaming, so it cannot read a `tool_resource` sent after the file; this one has the
 * complete body and runs before any provider is handed the upload.
 */
describe('filterFile', () => {
  const VENDOR_MIME = 'application/vnd.vendor.word';

  const makeFilterReq = (toolResource) => ({
    file: { size: 1024, mimetype: VENDOR_MIME, originalname: 'report.docx' },
    body: {
      endpoint: 'agents',
      file_id: '11111111-1111-4111-8111-111111111111',
      ...(toolResource ? { tool_resource: toolResource } : {}),
    },
    config: { fileConfig: {} },
  });

  beforeEach(() => {
    mergeFileConfig.mockReturnValue({
      ...makeFileConfig(),
      documentParser: { supportedMimeTypes: [new RegExp(`^${VENDOR_MIME}$`)] },
      endpoints: { default: { supportedMimeTypes: [/^application\/pdf$/] } },
    });
  });

  it('admits a parser-named MIME for a context upload', () => {
    expect(() => filterFile({ req: makeFilterReq(EToolResources.context) })).not.toThrow();
  });

  it.each([
    ['a different tool resource', 'file_search'],
    ['no tool resource at all', undefined],
  ])('refuses a parser-named MIME for %s', (_label, toolResource) => {
    expect(() => filterFile({ req: makeFilterReq(toolResource) })).toThrow('Unsupported file type');
  });
});
