import { Providers } from '@librechat/agents';
import { mbToBytes, isOpenAILikeProvider } from 'librechat-data-provider';

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
  provider: Providers,
  configuredFileSizeLimit?: number,
): Promise<PDFValidationResult> {
  if (provider === Providers.ANTHROPIC) {
    return validateAnthropicPdf(pdfBuffer, fileSize, configuredFileSizeLimit);
  }

  if (isOpenAILikeProvider(provider)) {
    return validateOpenAIPdf(fileSize, configuredFileSizeLimit);
  }

  if (provider === Providers.GOOGLE || provider === Providers.VERTEXAI) {
    return validateGooglePdf(fileSize, configuredFileSizeLimit);
  }

  return { isValid: true };
}

/**
 * Validates if a PDF meets Anthropic's requirements
 * @param pdfBuffer - The PDF file as a buffer
 * @param fileSize - The file size in bytes
 * @param configuredFileSizeLimit - Optional configured file size limit from fileConfig (in bytes)
 * @returns Promise that resolves to validation result
 */
async function validateAnthropicPdf(
  pdfBuffer: Buffer,
  fileSize: number,
  configuredFileSizeLimit?: number,
): Promise<PDFValidationResult> {
  try {
    const providerLimit = mbToBytes(32);
    const effectiveLimit =
      configuredFileSizeLimit !== undefined
        ? Math.min(configuredFileSizeLimit, providerLimit)
        : providerLimit;

    if (fileSize > effectiveLimit) {
      const limitMB = Math.round(effectiveLimit / (1024 * 1024));
      return {
        isValid: false,
        error: `PDF file size (${Math.round(fileSize / (1024 * 1024))}MB) exceeds the ${limitMB}MB limit`,
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

/**
 * Validates if a PDF meets OpenAI's requirements
 * @param fileSize - The file size in bytes
 * @param configuredFileSizeLimit - Optional configured file size limit from fileConfig (in bytes)
 * @returns Promise that resolves to validation result
 */
async function validateOpenAIPdf(
  fileSize: number,
  configuredFileSizeLimit?: number,
): Promise<PDFValidationResult> {
  const providerLimit = 10 * 1024 * 1024;
  const effectiveLimit =
    configuredFileSizeLimit !== undefined
      ? Math.min(configuredFileSizeLimit, providerLimit)
      : providerLimit;

  if (fileSize > effectiveLimit) {
    const limitMB = Math.round(effectiveLimit / (1024 * 1024));
    return {
      isValid: false,
      error: `PDF file size (${Math.round(fileSize / (1024 * 1024))}MB) exceeds the ${limitMB}MB limit`,
    };
  }

  return { isValid: true };
}

/**
 * Validates if a PDF meets Google's requirements
 * @param fileSize - The file size in bytes
 * @param configuredFileSizeLimit - Optional configured file size limit from fileConfig (in bytes)
 * @returns Promise that resolves to validation result
 */
async function validateGooglePdf(
  fileSize: number,
  configuredFileSizeLimit?: number,
): Promise<PDFValidationResult> {
  const providerLimit = 20 * 1024 * 1024;
  const effectiveLimit =
    configuredFileSizeLimit !== undefined
      ? Math.min(configuredFileSizeLimit, providerLimit)
      : providerLimit;

  if (fileSize > effectiveLimit) {
    const limitMB = Math.round(effectiveLimit / (1024 * 1024));
    return {
      isValid: false,
      error: `PDF file size (${Math.round(fileSize / (1024 * 1024))}MB) exceeds the ${limitMB}MB limit`,
    };
  }

  return { isValid: true };
}

/**
 * Validates video files for different providers
 * @param videoBuffer - The video file as a buffer
 * @param fileSize - The file size in bytes
 * @param provider - The provider to validate for
 * @returns Promise that resolves to validation result
 */
export async function validateVideo(
  videoBuffer: Buffer,
  fileSize: number,
  provider: Providers,
): Promise<VideoValidationResult> {
  if (provider === Providers.GOOGLE || provider === Providers.VERTEXAI) {
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
 * Validates audio files for different providers
 * @param audioBuffer - The audio file as a buffer
 * @param fileSize - The file size in bytes
 * @param provider - The provider to validate for
 * @returns Promise that resolves to validation result
 */
export async function validateAudio(
  audioBuffer: Buffer,
  fileSize: number,
  provider: Providers,
): Promise<AudioValidationResult> {
  if (provider === Providers.GOOGLE || provider === Providers.VERTEXAI) {
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
