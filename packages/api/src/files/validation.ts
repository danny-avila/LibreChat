import { mbToBytes, EModelEndpoint } from 'librechat-data-provider';

export interface PDFValidationResult {
  isValid: boolean;
  error?: string;
}

export interface VideoValidationResult {
  isValid: boolean;
  error?: string;
}

export interface AudioValidationResult {
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

  if (endpoint === EModelEndpoint.google) {
    return validateGooglePdf(fileSize);
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
    if (fileSize > mbToBytes(32)) {
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

async function validateGooglePdf(fileSize: number): Promise<PDFValidationResult> {
  if (fileSize > 20 * 1024 * 1024) {
    return {
      isValid: false,
      error: "PDF file size exceeds Google's 20MB limit",
    };
  }

  return { isValid: true };
}

/**
 * Validates video files for different endpoints
 * @param videoBuffer - The video file as a buffer
 * @param fileSize - The file size in bytes
 * @param endpoint - The endpoint to validate for
 * @returns Promise that resolves to validation result
 */
export async function validateVideo(
  videoBuffer: Buffer,
  fileSize: number,
  endpoint: EModelEndpoint,
): Promise<VideoValidationResult> {
  if (endpoint === EModelEndpoint.google) {
    if (fileSize > 20 * 1024 * 1024) {
      return {
        isValid: false,
        error: `Video file size (${Math.round(fileSize / (1024 * 1024))}MB) exceeds Google's 20MB limit`,
      };
    }
  }

  if (!videoBuffer || videoBuffer.length < 10) {
    return {
      isValid: false,
      error: 'Invalid video file: too small or corrupted',
    };
  }

  return { isValid: true };
}

/**
 * Validates audio files for different endpoints
 * @param audioBuffer - The audio file as a buffer
 * @param fileSize - The file size in bytes
 * @param endpoint - The endpoint to validate for
 * @returns Promise that resolves to validation result
 */
export async function validateAudio(
  audioBuffer: Buffer,
  fileSize: number,
  endpoint: EModelEndpoint,
): Promise<AudioValidationResult> {
  if (endpoint === EModelEndpoint.google) {
    if (fileSize > 20 * 1024 * 1024) {
      return {
        isValid: false,
        error: `Audio file size (${Math.round(fileSize / (1024 * 1024))}MB) exceeds Google's 20MB limit`,
      };
    }
  }

  if (!audioBuffer || audioBuffer.length < 10) {
    return {
      isValid: false,
      error: 'Invalid audio file: too small or corrupted',
    };
  }

  return { isValid: true };
}
