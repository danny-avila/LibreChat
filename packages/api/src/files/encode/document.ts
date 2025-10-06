import { EModelEndpoint, isDocumentSupportedEndpoint } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { Request } from 'express';
import type { StrategyFunctions, DocumentResult } from '~/types/files';
import { validatePdf } from '~/files/validation';
import { getFileStream } from './utils';

/**
 * Processes and encodes document files for various endpoints
 * @param req - Express request object
 * @param files - Array of file objects to process
 * @param endpoint - The endpoint identifier (e.g., EModelEndpoint.anthropic)
 * @param getStrategyFunctions - Function to get strategy functions
 * @returns Promise that resolves to documents and file metadata
 */
export async function encodeAndFormatDocuments(
  req: Request,
  files: IMongoFile[],
  { endpoint, useResponsesApi }: { endpoint: EModelEndpoint; useResponsesApi?: boolean },
  getStrategyFunctions: (source: string) => StrategyFunctions,
): Promise<DocumentResult> {
  if (!files?.length) {
    return { documents: [], files: [] };
  }

  const encodingMethods: Record<string, StrategyFunctions> = {};
  const result: DocumentResult = { documents: [], files: [] };

  const documentFiles = files.filter(
    (file) => file.type === 'application/pdf' || file.type?.startsWith('application/'),
  );

  if (!documentFiles.length) {
    return result;
  }

  const results = await Promise.allSettled(
    documentFiles.map((file) => {
      if (file.type !== 'application/pdf' || !isDocumentSupportedEndpoint(endpoint)) {
        return Promise.resolve(null);
      }
      return getFileStream(req, file, encodingMethods, getStrategyFunctions);
    }),
  );

  for (const settledResult of results) {
    if (settledResult.status === 'rejected') {
      console.error('Document processing failed:', settledResult.reason);
      continue;
    }

    const processed = settledResult.value;
    if (!processed) continue;

    const { file, content, metadata } = processed;

    if (!content || !file) {
      if (metadata) result.files.push(metadata);
      continue;
    }

    if (file.type === 'application/pdf' && isDocumentSupportedEndpoint(endpoint)) {
      const pdfBuffer = Buffer.from(content, 'base64');
      const validation = await validatePdf(pdfBuffer, pdfBuffer.length, endpoint);

      if (!validation.isValid) {
        throw new Error(`PDF validation failed: ${validation.error}`);
      }

      if (endpoint === EModelEndpoint.anthropic) {
        result.documents.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: content,
          },
          cache_control: { type: 'ephemeral' },
          citations: { enabled: true },
        });
      } else if (useResponsesApi) {
        result.documents.push({
          type: 'input_file',
          filename: file.filename,
          file_data: `data:application/pdf;base64,${content}`,
        });
      } else if (endpoint === EModelEndpoint.openAI) {
        result.documents.push({
          type: 'file',
          file: {
            filename: file.filename,
            file_data: `data:application/pdf;base64,${content}`,
          },
        });
      } else if (endpoint === EModelEndpoint.google) {
        result.documents.push({
          type: 'document',
          mimeType: 'application/pdf',
          data: content,
        });
      }

      result.files.push(metadata);
    }
  }

  return result;
}
