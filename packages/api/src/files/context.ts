import { logger } from '@librechat/data-schemas';
import {
  FileSources,
  mergeFileConfig,
  defaultFileMetadataFields,
  type TFileMetadataConfig,
} from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types';
import { processTextWithTokenLimit } from '~/utils/text';

/**
 * Formats bytes into a human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 Bytes';
  }
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const index = Math.min(i, sizes.length - 1);
  return parseFloat((bytes / Math.pow(k, index)).toFixed(2)) + ' ' + sizes[index];
}

/**
 * Escapes special XML characters in a string.
 */
function escapeXml(value: unknown): string {
  const str = String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Formats metadata as markdown.
 */
function formatAsMarkdown(metadata: Record<string, unknown>): string {
  const lines = ['**File Metadata:**'];
  for (const [key, value] of Object.entries(metadata)) {
    lines.push(`- **${key}**: ${value}`);
  }
  return lines.join('\n');
}

/**
 * Formats metadata as XML.
 */
function formatAsXml(metadata: Record<string, unknown>): string {
  const items = Object.entries(metadata)
    .map(([key, value]) => `  <${key}>${escapeXml(value)}</${key}>`)
    .join('\n');
  return `<file_metadata>\n${items}\n</file_metadata>`;
}

/**
 * Formats file metadata according to configuration.
 * @param file - The file object containing metadata
 * @param config - The metadata configuration
 * @returns Formatted metadata string, or empty string if disabled
 */
export function formatFileMetadata(
  file: IMongoFile,
  config: TFileMetadataConfig | undefined,
): string {
  if (!config?.enabled) {
    return '';
  }

  const fields = config.fields ?? defaultFileMetadataFields;
  const metadata: Record<string, unknown> = {};

  for (const field of fields) {
    switch (field) {
      case 'filename':
        if (file.filename) {
          metadata.filename = file.filename;
        }
        break;
      case 'type':
        if (file.type) {
          metadata.type = file.type;
        }
        break;
      case 'bytes':
        if (file.bytes !== undefined) {
          metadata.bytes = file.bytes;
          metadata.size_human = formatBytes(file.bytes);
        }
        break;
      case 'source':
        if (file.source) {
          metadata.source = file.source;
        }
        break;
      case 'width':
        if (file.width !== undefined) {
          metadata.width = file.width;
        }
        break;
      case 'height':
        if (file.height !== undefined) {
          metadata.height = file.height;
        }
        break;
      case 'createdAt':
        if (file.createdAt) {
          metadata.createdAt =
            file.createdAt instanceof Date ? file.createdAt.toISOString() : file.createdAt;
        }
        break;
      case 'updatedAt':
        if (file.updatedAt) {
          metadata.updatedAt =
            file.updatedAt instanceof Date ? file.updatedAt.toISOString() : file.updatedAt;
        }
        break;
      case 'filepath':
        if (file.filepath) {
          metadata.filepath = file.filepath;
        }
        break;
      case 'conversationId':
        if (file.conversationId) {
          metadata.conversationId = file.conversationId;
        }
        break;
      case 'file_id':
        if (file.file_id) {
          metadata.file_id = file.file_id;
        }
        break;
    }
  }

  if (Object.keys(metadata).length === 0) {
    return '';
  }

  const format = config.format ?? 'markdown';
  switch (format) {
    case 'json':
      return JSON.stringify(metadata, null, 2);
    case 'xml':
      return formatAsXml(metadata);
    case 'markdown':
    default:
      return formatAsMarkdown(metadata);
  }
}

/**
 * Extracts text context from attachments and returns formatted text.
 * This handles text that was already extracted from files (OCR, transcriptions, document text, etc.)
 * @param params - The parameters object
 * @param params.attachments - Array of file attachments
 * @param params.req - Express request object for config access
 * @param params.tokenCountFn - Function to count tokens in text
 * @returns The formatted file context text, or undefined if no text found
 */
export async function extractFileContext({
  attachments,
  req,
  tokenCountFn,
}: {
  attachments: IMongoFile[];
  req?: ServerRequest;
  tokenCountFn: (text: string) => number;
}): Promise<string | undefined> {
  if (!attachments || attachments.length === 0) {
    return undefined;
  }

  const fileConfig = mergeFileConfig(req?.config?.fileConfig);
  const fileTokenLimit = req?.body?.fileTokenLimit ?? fileConfig.fileTokenLimit;
  const metadataConfig = fileConfig.metadata;

  // Check if we have any work to do
  const hasMetadataEnabled = metadataConfig?.enabled === true;

  if (!fileTokenLimit && !hasMetadataEnabled) {
    return undefined;
  }

  let resultText = '';
  let metadataText = '';

  // Generate metadata for all files if enabled
  if (hasMetadataEnabled) {
    const metadataBlocks: string[] = [];
    for (const file of attachments) {
      const block = formatFileMetadata(file, metadataConfig);
      if (block) {
        metadataBlocks.push(block);
      }
    }
    if (metadataBlocks.length > 0) {
      metadataText = metadataBlocks.join('\n\n');

      // Apply token limits to metadata text to avoid consuming excessive context
      if (fileTokenLimit) {
        const { text: limitedMetadataText, wasTruncated } = await processTextWithTokenLimit({
          text: metadataText,
          tokenLimit: fileTokenLimit,
          tokenCountFn,
        });

        if (wasTruncated) {
          logger.debug('[extractFileContext] Metadata text truncated due to token limits');
        }

        metadataText = limitedMetadataText;
      }
    }
  }

  // Process text content from files
  if (fileTokenLimit) {
    for (const file of attachments) {
      const source = file.source ?? FileSources.local;
      if (source === FileSources.text && file.text) {
        const { text: limitedText, wasTruncated } = await processTextWithTokenLimit({
          text: file.text,
          tokenLimit: fileTokenLimit,
          tokenCountFn,
        });

        if (wasTruncated) {
          logger.debug(
            `[extractFileContext] Text content truncated for file: ${file.filename} due to token limits`,
          );
        }

        resultText += `${!resultText ? 'Attached document(s):\n```md' : '\n\n---\n\n'}# "${file.filename}"\n${limitedText}\n`;
      }
    }

    if (resultText) {
      resultText += '\n```';
    }
  }

  // Combine metadata and text content
  if (metadataText && resultText) {
    return `${metadataText}\n\n${resultText}`;
  } else if (metadataText) {
    return metadataText;
  } else if (resultText) {
    return resultText;
  }

  return undefined;
}
