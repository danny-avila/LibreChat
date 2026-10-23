import { dirname, join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { FiltersConfig } from 'librechat-data-provider';
import { createDocumentExtractor, ExtractionServiceError, readExtractionInput } from './client';
import { prepareCodeOutputBufferForInspection } from '../code/inspection';
import { capabilities, fixture, reply, result } from './fixture.helper';
import { resolveUploadFallbackText } from '../upload/fallback';
import { preflightCodeOutputBatch } from '../code/preflight';
import { resolveUploadDocumentText } from './upload';
import { parseDocument } from '../documents/crud';

const file = {
  originalname: 'body.docx',
  mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  buffer: Buffer.from('exact document bytes'),
} as Express.Multer.File;
function dependencies() {
  return {
    file,
    extractOCR: jest.fn(async () => ({ text: 'local OCR' })),
    extractConfiguredText: jest.fn(async () => ({ text: 'local RAG' })),
    extractDocument: jest.fn(async () => ({ text: 'local Mammoth/PDF.js' })),
    onFailure: jest.fn(),
  };
}

describe('selected remote semantic extraction callers', () => {
  it.each([
    'BUSY',
    'UNSUPPORTED_CONTENT',
    'INCOMPATIBLE_SERVICE',
    'INVALID_RESPONSE',
    'UNAVAILABLE',
    'DEADLINE',
  ])('does not fall back on %s at any upload boundary', async (code) => {
    const deps = dependencies();
    const extractor = {
      maxInputBytes: 10485760,
      extract: jest.fn().mockRejectedValue(new ExtractionServiceError(code)),
    };
    await expect(
      resolveUploadDocumentText({ ...deps, extractor, configuredOCR: true, configuredText: true }),
    ).rejects.toMatchObject({ code });
    expect(deps.extractOCR).not.toHaveBeenCalled();
    expect(deps.extractConfiguredText).not.toHaveBeenCalled();
    expect(deps.extractDocument).not.toHaveBeenCalled();
    expect(deps.onFailure).not.toHaveBeenCalled();
  });

  it('keeps legacy behavior when disabled and leaves other formats unmigrated', async () => {
    const deps = dependencies();
    await expect(
      resolveUploadDocumentText({ ...deps, config: { enabled: false } }),
    ).resolves.toEqual({ text: 'local Mammoth/PDF.js' });
    const extract = jest.fn();
    await resolveUploadDocumentText({
      ...deps,
      file: {
        ...file,
        originalname: 'sheet.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      extractor: { maxInputBytes: 10485760, extract },
    });
    expect(extract).not.toHaveBeenCalled();
    expect(deps.extractDocument).toHaveBeenCalledTimes(2);
  });

  it('routes a real disk upload through parseDocument config wiring and bounds the disk read', async () => {
    const server = await fixture((req, res) => {
      req.resume();
      reply(res, req.method === 'GET' ? capabilities : result(file.buffer, 'docx'));
    });
    try {
      const path = join(dirname(server.socketPath), 'upload.docx');
      await writeFile(path, file.buffer);
      const { buffer: _buffer, ...diskFile } = file;
      const upload = { ...diskFile, path } as Express.Multer.File;
      const config = { enabled: true, socketPath: server.socketPath };
      await expect(
        parseDocument({
          file: upload,
          req: { config: { fileConfig: { extractionService: config } } },
        }),
      ).resolves.toMatchObject({ text: '你好!', bytes: 7 });
      await expect(
        readExtractionInput(upload, { maxInputBytes: 2, extract: jest.fn() }),
      ).rejects.toMatchObject({ code: 'INPUT_LIMIT' });
      await expect(
        readExtractionInput(
          { ...upload, path: '/private/secret-document.docx' },
          { maxInputBytes: 2, extract: jest.fn() },
        ),
      ).rejects.toThrow('Document extraction failed (INPUT_UNAVAILABLE).');
    } finally {
      await server.close();
    }
  });

  it('flattens ordered segments only for the upload string consumer', async () => {
    const deps = dependencies();
    const value = result(file.buffer, 'docx');
    await expect(
      resolveUploadDocumentText({
        ...deps,
        extractor: { maxInputBytes: 10485760, extract: jest.fn().mockResolvedValue(value) },
      }),
    ).resolves.toMatchObject({ text: '你好!', bytes: 7 });
    expect(deps.extractDocument).not.toHaveBeenCalled();
  });

  it.each(['report.docx', 'report.pdf'])(
    'never invokes artifact raw-text, local semantic or HTML fallback for %s',
    async (name) => {
      const extractRawText = jest.fn();
      const extractInspectionText = jest.fn();
      const extract = jest
        .fn()
        .mockRejectedValue(new ExtractionServiceError('UNSUPPORTED_CONTENT'));
      await expect(
        prepareCodeOutputBufferForInspection({
          buffer: file.buffer,
          name,
          fileSizeLimit: 10485760,
          determineFileType: async () => null,
          extractRawText,
          extractInspectionText,
          extractor: { maxInputBytes: 10485760, extract },
        }),
      ).rejects.toMatchObject({ code: 'UNSUPPORTED_CONTENT' });
      expect(extractRawText).not.toHaveBeenCalled();
      expect(extractInspectionText).not.toHaveBeenCalled();
    },
  );

  it('still skips content extraction when inspection is not selected', async () => {
    const extract = jest.fn();
    await prepareCodeOutputBufferForInspection({
      buffer: file.buffer,
      name: 'report.pdf',
      fileSizeLimit: 10485760,
      inspectContent: false,
      determineFileType: async () => null,
      extractor: { maxInputBytes: 10485760, extract },
    });
    expect(extract).not.toHaveBeenCalled();
  });

  it('fails strict artifact policy before producing persistable entries on remote failure', async () => {
    const filters: FiltersConfig = {
      files: {
        pii: {
          fields: ['extracted_text'],
          uninspectable: 'block',
          starterPatterns: [],
          customPatterns: [{ id: 'private', label: 'private', regex: 'PRIVATE' }],
        },
      },
    };
    await expect(
      preflightCodeOutputBatch({
        filters,
        artifact: { session_id: 'session', files: [{ id: 'id', name: 'report.docx' }] },
        limits: { fileLimit: 10, fileSizeLimit: 10485760, totalSizeLimit: 10485760 },
        prepare: async () => {
          throw new ExtractionServiceError('BUSY');
        },
      }),
    ).rejects.toMatchObject({ code: 'content_filter_uninspectable' });
  });

  it('does not store fallback text or invoke a local reader when remote rejects an optional tool upload', async () => {
    const server = await fixture((req, res) => {
      req.resume();
      reply(
        res,
        req.method === 'GET' ? capabilities : { error: { code: 'UNSUPPORTED_CONTENT' } },
        req.method === 'GET' ? 200 : 422,
      );
    });
    try {
      const extractors = {
        parseDocument: jest.fn(async () => ({ text: 'unsafe fallback' })),
        parseTextNative: jest.fn(async () => ({ text: 'raw bytes' })),
      };
      await expect(
        resolveUploadFallbackText({
          file,
          fileId: 'file',
          deliveryPath: 'none',
          destinationChosen: false,
          isMessageAttachment: true,
          endpointConfig: { textFallbackWithoutTools: true },
          extractionService: { enabled: true, socketPath: server.socketPath },
          extractors,
        }),
      ).resolves.toBeUndefined();
      expect(extractors.parseDocument).not.toHaveBeenCalled();
      expect(extractors.parseTextNative).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('uses the real client on artifact inspection and never marks service text as HTML', async () => {
    const server = await fixture((req, res) => {
      req.resume();
      reply(res, req.method === 'GET' ? capabilities : result(file.buffer, 'docx'));
    });
    try {
      const prepared = await prepareCodeOutputBufferForInspection({
        buffer: file.buffer,
        name: 'body.docx',
        fileSizeLimit: 10485760,
        determineFileType: async () => ({ mime: file.mimetype }),
        extractor: createDocumentExtractor({ enabled: true, socketPath: server.socketPath }),
      });
      expect(prepared.extractedTextComplete).toBe(true);
      expect(prepared.file.extractedText).toBe('你好!');
      expect(prepared.file.content).toBeUndefined();
    } finally {
      await server.close();
    }
  });
});
