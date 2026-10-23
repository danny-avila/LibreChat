import { FileSources } from 'librechat-data-provider';
import type { ExtractionServiceConfig } from 'librechat-data-provider';
import type { ExtractionUploadPersistence } from './commit';
import type { MistralOCRUploadResult } from '~/types';
import type { ExtractionLifetime } from './lifetime';
import type { DocumentExtractor } from './client';
import {
  createDocumentExtractor,
  extractionText,
  getExtractionFormat,
  readExtractionInput,
} from './client';
import { withExtractionLifetime } from './lifetime';

interface DocumentText {
  text?: string | null;
}

/** Remote selection precedes every OCR/RAG/built-in fallback boundary. */
export async function resolveUploadDocumentText<T extends DocumentText>(
  input: {
    file: Express.Multer.File;
    signal?: ExtractionLifetime['signal'];
    request?: ExtractionLifetime['request'];
    response?: ExtractionLifetime['response'];
    config?: ExtractionServiceConfig;
    extractor?: DocumentExtractor;
    persistence?: ExtractionUploadPersistence;
  } & (
    | { extract: () => Promise<T> }
    | {
        configuredOCR?: boolean;
        configuredText?: boolean;
        extractOCR: () => Promise<T>;
        extractConfiguredText: () => Promise<T>;
        extractDocument: () => Promise<T>;
        onFailure: (source: 'ocr' | 'rag' | 'document', error: unknown) => void;
      }
  ),
): Promise<T | MistralOCRUploadResult> {
  const extractor = input.extractor ?? createDocumentExtractor(input.config);
  const format = getExtractionFormat(input.file.originalname, input.file.mimetype);
  if (extractor && format) {
    input.persistence?.select();
    return withExtractionLifetime(
      { ...input, deadlineMs: extractor.deadlineMs },
      async (signal) => {
        const result = await extractor.extract(
          await readExtractionInput(input.file, extractor, signal),
          format,
          signal,
        );
        const text = extractionText(result);
        return {
          filename: input.file.originalname,
          bytes: Buffer.byteLength(text, 'utf8'),
          filepath: FileSources.document_parser,
          text,
          images: [],
        };
      },
    );
  }
  if ('extract' in input) return input.extract();
  if (input.configuredText) {
    try {
      return await input.extractConfiguredText();
    } catch (error) {
      input.onFailure('rag', error);
    }
  }
  if (input.configuredOCR) {
    try {
      return await input.extractOCR();
    } catch (error) {
      input.onFailure('ocr', error);
    }
  }
  try {
    return await input.extractDocument();
  } catch (error) {
    input.onFailure('document', error);
    throw error;
  }
}
