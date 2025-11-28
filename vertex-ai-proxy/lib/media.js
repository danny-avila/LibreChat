import { readFileSync } from 'fs';
import { extname } from 'path';

/**
 * Supported image MIME types for Claude Vision
 */
const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
];

/**
 * Supported document MIME types
 */
const SUPPORTED_DOCUMENT_TYPES = [
  'application/pdf',
  'text/plain',
  'text/html',
  'text/css',
  'text/javascript',
  'application/json',
  'text/markdown',
  'text/csv'
];

/**
 * Get MIME type from file extension
 * @param {string} filename - File name or path
 * @returns {string} MIME type
 */
export function getMimeType(filename) {
  const ext = extname(filename).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.md': 'text/markdown',
    '.csv': 'text/csv'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Check if MIME type is a supported image type
 * @param {string} mimeType - MIME type to check
 * @returns {boolean}
 */
export function isSupportedImage(mimeType) {
  return SUPPORTED_IMAGE_TYPES.includes(mimeType);
}

/**
 * Check if MIME type is a supported document type
 * @param {string} mimeType - MIME type to check
 * @returns {boolean}
 */
export function isSupportedDocument(mimeType) {
  return SUPPORTED_DOCUMENT_TYPES.includes(mimeType);
}

/**
 * Convert file to base64
 * @param {string} filePath - Path to file
 * @returns {string} Base64 encoded content
 */
export function fileToBase64(filePath) {
  const buffer = readFileSync(filePath);
  return buffer.toString('base64');
}

/**
 * Process image content for Anthropic API format
 * @param {object} imageContent - Image content object
 * @returns {object} Formatted image content for Vertex AI
 */
export function processImageContent(imageContent) {
  // Already in correct format
  if (imageContent.source && imageContent.source.type === 'base64') {
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: imageContent.source.media_type,
        data: imageContent.source.data
      }
    };
  }

  // URL format - need to fetch and convert
  if (imageContent.source && imageContent.source.type === 'url') {
    // For now, pass through - Vertex AI may support URLs
    return {
      type: 'image',
      source: {
        type: 'url',
        url: imageContent.source.url
      }
    };
  }

  // Legacy format with image_url
  if (imageContent.image_url) {
    const url = imageContent.image_url.url || imageContent.image_url;
    
    // Check if it's a data URL
    if (url.startsWith('data:')) {
      const matches = url.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: matches[1],
            data: matches[2]
          }
        };
      }
    }

    // Regular URL
    return {
      type: 'image',
      source: {
        type: 'url',
        url: url
      }
    };
  }

  return imageContent;
}

/**
 * Process document content for Anthropic API format
 * @param {object} docContent - Document content object
 * @returns {object} Formatted document content
 */
export function processDocumentContent(docContent) {
  // PDF documents
  if (docContent.source && docContent.source.media_type === 'application/pdf') {
    return {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: docContent.source.data
      }
    };
  }

  // Text documents - convert to text content
  if (docContent.source && docContent.source.media_type?.startsWith('text/')) {
    const text = Buffer.from(docContent.source.data, 'base64').toString('utf8');
    return {
      type: 'text',
      text: text
    };
  }

  return docContent;
}

/**
 * Process message content array for Vertex AI
 * @param {Array|string} content - Message content
 * @returns {Array|string} Processed content
 */
export function processMessageContent(content) {
  // Simple text content
  if (typeof content === 'string') {
    return content;
  }

  // Array of content blocks
  if (Array.isArray(content)) {
    return content.map(block => {
      if (block.type === 'text') {
        return block;
      }
      
      if (block.type === 'image' || block.type === 'image_url') {
        return processImageContent(block);
      }
      
      if (block.type === 'document') {
        return processDocumentContent(block);
      }

      // Pass through unknown types
      return block;
    });
  }

  return content;
}

/**
 * Process all messages for Vertex AI
 * @param {Array} messages - Array of messages
 * @returns {Array} Processed messages
 */
export function processMessages(messages) {
  return messages.map(message => ({
    ...message,
    content: processMessageContent(message.content)
  }));
}
