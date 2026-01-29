import { Providers } from '@librechat/agents';
import { isOpenAILikeProvider, isDocumentSupportedProvider, FileSources } from 'librechat-data-provider';
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
 * Check if we should use public URLs for S3/Azure files instead of base64
 * When enabled, documents from S3/Azure will be sent as URLs instead of base64
 */
const usePublicUrlForBlobStorage =
  process.env.S3_USE_PUBLIC_URL === 'true' || process.env.AZURE_USE_PUBLIC_URL === 'true';

const blobStorageSources = new Set([FileSources.azure_blob, FileSources.s3]);

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

      // Check if we should use public URL for S3/Azure files
      // For Anthropic, we still need to download because it requires base64
      const fileSource = (file.source ?? FileSources.local) as FileSources;
      const usePublicUrl = blobStorageSources.has(fileSource) && usePublicUrlForBlobStorage
        && provider !== Providers.ANTHROPIC; // Anthropic requires base64 for documents

      if (usePublicUrl) {
        // For S3/Azure files with public URL enabled, use the URL directly without downloading
        console.log(`[encodeAndFormatDocuments] Using public URL for ${fileSource} file: ${file.filepath}`);
        return Promise.resolve({
          file,
          content: null, // No base64 content
          url: file.filepath, // Use the S3/Azure public URL
          metadata: {
            file_id: file.file_id,
            temp_file_id: file.temp_file_id,
            filepath: file.filepath,
            source: file.source,
            filename: file.filename,
            type: file.type,
          },
        });
      }

      // Otherwise, download and convert to base64 (original behavior)
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

    const { file, content, url, metadata } = processed;

    // If we have a URL (from S3/Azure public), use it directly
    if (url && !content) {
      console.log(`[encodeAndFormatDocuments] Using URL for document: ${url}`);

      if (provider === Providers.GOOGLE || provider === Providers.VERTEXAI) {
        result.documents.push({
          type: 'media',
          file_uri: url, // Google supports file_uri for media
          mimeType: file.type,
        });
      } else if (isOpenAILikeProvider(provider) && provider != Providers.AZURE) {
        // Use file_uri for OpenAI-like providers
        result.documents.push({
          type: 'file',
          file: {
            filename: file.filename,
            file_uri: url,
          },
        });
      } else if (useResponsesApi) {
        result.documents.push({
          type: 'input_file',
          filename: file.filename,
          file_uri: url,
        });
      } else if (provider === Providers.ANTHROPIC) {
        // Fallback to downloading for Anthropic (requires base64)
        console.log('[encodeAndFormatDocuments] Anthropic requires base64, downloading file...');
        const downloaded = await getFileStream(req, file, encodingMethods, getStrategyFunctions);
        if (downloaded?.content) {
          const document: AnthropicDocumentBlock = {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: downloaded.content,
            },
            citations: { enabled: true },
          };

          if (file.filename) {
            document.context = `File: "${file.filename}"`;
          }

          result.documents.push(document);
        }
      }
      result.files.push(metadata);
      continue;
    }

    // Original base64 handling (for downloaded files)
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
          type: 'media',
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
