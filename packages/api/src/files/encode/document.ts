import { Providers } from '@librechat/agents';
import { isOpenAILikeProvider, isDocumentSupportedProvider } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type {
  AnthropicDocumentBlock,
  StrategyFunctions,
  DocumentResult,
  ServerRequest,
} from '~/types';
import { getFileStream, getConfiguredFileSizeLimit } from './utils';
import { validatePdf } from '~/files/validation';

/**
 * Processes and encodes document files for various providers
 * @param req - Express request object
 * @param files - Array of file objects to process
 * @param params - Object containing provider, endpoint, and other options
 * @param params.provider - The provider name
 * @param params.endpoint - Optional endpoint name for file config lookup
 * @param params.useResponsesApi - Whether to use responses API format
 * @param getStrategyFunctions - Function to get strategy functions
 * @returns Promise that resolves to documents and file metadata
 */
export async function encodeAndFormatDocuments(
  req: ServerRequest,
  files: IMongoFile[],
  params: { provider: Providers; endpoint?: string; useResponsesApi?: boolean },
  getStrategyFunctions: (source: string) => StrategyFunctions,
): Promise<DocumentResult> {
  const { provider, endpoint, useResponsesApi } = params;
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
      if (file.type !== 'application/pdf' || !isDocumentSupportedProvider(provider)) {
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

    if (file.type === 'application/pdf' && isDocumentSupportedProvider(provider)) {
      const pdfBuffer = Buffer.from(content, 'base64');

      /** Extract configured file size limit from fileConfig for this endpoint */
      const configuredFileSizeLimit = getConfiguredFileSizeLimit(req, {
        provider,
        endpoint,
      });

      const validation = await validatePdf(
        pdfBuffer,
        pdfBuffer.length,
        provider,
        configuredFileSizeLimit,
      );

      if (!validation.isValid) {
        throw new Error(`PDF validation failed: ${validation.error}`);
      }

      if (provider === Providers.ANTHROPIC) {
        const document: AnthropicDocumentBlock = {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: content,
          },
          citations: { enabled: true },
        };

        if (file.filename) {
          document.context = `File: "${file.filename}"`;
        }

        result.documents.push(document);
      } else if (useResponsesApi) {
        result.documents.push({
          type: 'input_file',
          filename: file.filename,
          file_data: `data:application/pdf;base64,${content}`,
        });
      } else if (provider === Providers.GOOGLE || provider === Providers.VERTEXAI) {
        result.documents.push({
          type: 'document',
          mimeType: 'application/pdf',
          data: content,
        });
      } else if (isOpenAILikeProvider(provider) && provider != Providers.AZURE) {
        result.documents.push({
          type: 'file',
          file: {
            filename: file.filename,
            file_data: `data:application/pdf;base64,${content}`,
          },
        });
      }
      result.files.push(metadata);
    }
  }

  return result;
}
