const { logger } = require('~/config');
const { anthropicPdfSizeLimit } = require('librechat-data-provider');

/**
 * Validates if a PDF meets Anthropic's requirements
 * @param {Buffer} pdfBuffer - The PDF file as a buffer
 * @param {number} fileSize - The file size in bytes
 * @returns {Promise<{isValid: boolean, error?: string}>}
 */
async function validateAnthropicPdf(pdfBuffer, fileSize) {
  try {
    // Check file size (32MB limit)
    if (fileSize > anthropicPdfSizeLimit) {
      return {
        isValid: false,
        error: `PDF file size (${Math.round(fileSize / (1024 * 1024))}MB) exceeds Anthropic's 32MB limit`,
      };
    }

    // Basic PDF header validation
    if (!pdfBuffer || pdfBuffer.length < 5) {
      return {
        isValid: false,
        error: 'Invalid PDF file: too small or corrupted',
      };
    }

    // Check PDF magic bytes
    const pdfHeader = pdfBuffer.subarray(0, 5).toString();
    if (!pdfHeader.startsWith('%PDF-')) {
      return {
        isValid: false,
        error: 'Invalid PDF file: missing PDF header',
      };
    }

    // Check for password protection/encryption
    const pdfContent = pdfBuffer.toString('binary');
    if (
      pdfContent.includes('/Encrypt ') ||
      pdfContent.includes('/U (') ||
      pdfContent.includes('/O (')
    ) {
      return {
        isValid: false,
        error: 'PDF is password-protected or encrypted. Anthropic requires unencrypted PDFs.',
      };
    }

    // Estimate page count (this is a rough estimation)
    const pageMatches = pdfContent.match(/\/Type[\s]*\/Page[^s]/g);
    const estimatedPages = pageMatches ? pageMatches.length : 1;

    if (estimatedPages > 100) {
      return {
        isValid: false,
        error: `PDF has approximately ${estimatedPages} pages, exceeding Anthropic's 100-page limit`,
      };
    }

    logger.debug(
      `PDF validation passed: ${Math.round(fileSize / 1024)}KB, ~${estimatedPages} pages`,
    );

    return { isValid: true };
  } catch (error) {
    logger.error('PDF validation error:', error);
    return {
      isValid: false,
      error: 'Failed to validate PDF file',
    };
  }
}

module.exports = {
  validateAnthropicPdf,
};
