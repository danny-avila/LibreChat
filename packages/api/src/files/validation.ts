import { anthropicPdfSizeLimit, EModelEndpoint } from 'librechat-data-provider';

export interface PDFValidationResult {
  isValid: boolean;
  error?: string;
}

export async function validatePdf(
  pdfBuffer: Buffer,
  fileSize: number,
  endpoint: EModelEndpoint,
): Promise<PDFValidationResult> {
  if (endpoint === EModelEndpoint.anthropic) {
    return validateAnthropicPdf(pdfBuffer, fileSize);
  }

  if (endpoint === EModelEndpoint.openAI || endpoint === EModelEndpoint.azureOpenAI) {
    return validateOpenAIPdf(fileSize);
  }

  return { isValid: true };
}

/**
 * Validates if a PDF meets Anthropic's requirements
 * @param pdfBuffer - The PDF file as a buffer
 * @param fileSize - The file size in bytes
 * @returns Promise that resolves to validation result
 */
async function validateAnthropicPdf(
  pdfBuffer: Buffer,
  fileSize: number,
): Promise<PDFValidationResult> {
  try {
    if (fileSize > anthropicPdfSizeLimit) {
      return {
        isValid: false,
        error: `PDF file size (${Math.round(fileSize / (1024 * 1024))}MB) exceeds Anthropic's 32MB limit`,
      };
    }

    if (!pdfBuffer || pdfBuffer.length < 5) {
      return {
        isValid: false,
        error: 'Invalid PDF file: too small or corrupted',
      };
    }

    const pdfHeader = pdfBuffer.subarray(0, 5).toString();
    if (!pdfHeader.startsWith('%PDF-')) {
      return {
        isValid: false,
        error: 'Invalid PDF file: missing PDF header',
      };
    }

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

    const pageMatches = pdfContent.match(/\/Type[\s]*\/Page[^s]/g);
    const estimatedPages = pageMatches ? pageMatches.length : 1;

    if (estimatedPages > 100) {
      return {
        isValid: false,
        error: `PDF has approximately ${estimatedPages} pages, exceeding Anthropic's 100-page limit`,
      };
    }

    return { isValid: true };
  } catch (error) {
    console.error('PDF validation error:', error);
    return {
      isValid: false,
      error: 'Failed to validate PDF file',
    };
  }
}

async function validateOpenAIPdf(fileSize: number): Promise<PDFValidationResult> {
  if (fileSize > 10 * 1024 * 1024) {
    return {
      isValid: false,
      error: "PDF file size exceeds OpenAI's 10MB limit",
    };
  }

  return { isValid: true };
}
