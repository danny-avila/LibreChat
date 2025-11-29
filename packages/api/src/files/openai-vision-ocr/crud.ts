import * as fs from 'node:fs';
import * as path from 'node:path';
import { logger } from '@librechat/data-schemas';
import { FileSources, envVarRegex, extractEnvVariable } from 'librechat-data-provider';
import type { AxiosError } from 'axios';
import type { ServerRequest, OpenAIVisionOCRUploadResult } from '~/types';
import { logAxiosError, createAxiosInstance } from '~/utils/axios';

const axios = createAxiosInstance();

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_VISION_MODEL = 'gpt-4o';

/** Helper type for OCR request context */
interface OCRContext {
  req: ServerRequest;
  file: Express.Multer.File;
}

/**
 * Uses GPT-4o Vision to extract text from an image or document
 *
 * @param params Upload parameters
 * @param params.filePath The path to the file on disk
 * @param params.apiKey OpenAI API key
 * @param params.baseURL OpenAI API base URL
 * @param params.model Vision model to use for OCR
 * @returns The response from OpenAI API
 */
async function performVisionOCR({
  filePath,
  apiKey,
  baseURL = DEFAULT_OPENAI_BASE_URL,
  model = DEFAULT_VISION_MODEL,
}: {
  filePath: string;
  apiKey: string;
  baseURL?: string;
  model?: string;
}): Promise<{
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}> {
  // Read file to base64
  const fileBuffer = fs.readFileSync(filePath);
  const base64Image = fileBuffer.toString('base64');

  // Determine the correct MIME type based on file extension
  const ext = path.extname(filePath).toLowerCase();
  let mimeType: string;

  // Only allow supported image types for vision API
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      mimeType = 'image/jpeg';
      break;
    case '.png':
      mimeType = 'image/png';
      break;
    case '.gif':
      mimeType = 'image/gif';
      break;
    case '.webp':
      mimeType = 'image/webp';
      break;
    default:
      // Default to PNG for unknown types
      mimeType = 'image/png';
  }

  const response = await axios.post(
    `${baseURL}/chat/completions`,
    {
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a precise OCR service. Extract text from images exactly as it appears, preserving layout when important. For tables, use markdown table format. For structured content with headings, use markdown headings. Focus on accuracy of text content rather than perfect formatting. Keep all original text including numbers, special characters, and punctuation.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract all text from this image/document:',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      max_tokens: 2048,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );

  return response.data;
}

/**
 * Uploads a file for OCR processing using OpenAI Vision
 *
 * @param context - The context object containing request and file
 * @param context.req - The request object
 * @param context.file - The file object
 * @returns The OCR result
 */
export const uploadOpenAIVisionOCR = async (
  context: OCRContext,
): Promise<OpenAIVisionOCRUploadResult> => {
  try {
    const ocrConfig = context.req.config?.ocr;
    const modelConfig = ocrConfig?.visionModel || '';
    const isModelEnvVar = envVarRegex.test(modelConfig);

    // Always use server environment variables for OCR
    const apiKey = process.env.OPENAI_API_KEY;
    const baseURL = process.env.OPENAI_API_HOST || DEFAULT_OPENAI_BASE_URL;

    if (!apiKey) {
      logger.error('[OpenAI Vision OCR] Missing OPENAI_API_KEY in server environment');
      throw new Error('OpenAI API key not configured on server');
    }

    logger.info('[OpenAI Vision OCR] Using server configuration', {
      hasApiKey: !!apiKey,
      baseURL,
    });

    const model = isModelEnvVar
      ? extractEnvVariable(modelConfig) || DEFAULT_VISION_MODEL
      : modelConfig.trim() || DEFAULT_VISION_MODEL;

    logger.info(`[OpenAI Vision OCR] Using model: ${model}`);

    // Check if file is a supported image type for vision API
    const ext = path.extname(context.file.path).toLowerCase();
    const supportedImageExts = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

    if (!supportedImageExts.has(ext)) {
      const error = `Unsupported file type for Vision OCR: ${ext}. Only image types ${Array.from(supportedImageExts).join(', ')} are supported.`;
      logger.error(`[OpenAI Vision OCR] ${error}`);
      throw new Error(error);
    }

    const ocrResult = await performVisionOCR({
      filePath: context.file.path,
      apiKey,
      baseURL,
      model,
    });

    // Extract text from OpenAI response
    const extractedText = ocrResult.choices[0].message.content;

    return {
      filename: context.file.originalname,
      bytes: extractedText.length * 4,
      filepath: FileSources.openai_vision_ocr,
      text: extractedText,
      // Note: we don't extract images since this is a text extraction service
      images: [],
    };
  } catch (error) {
    logger.error(`[OpenAI Vision OCR] Error in uploadOpenAIVisionOCR: ${(error as Error).message}`);
    const message = 'Error performing OCR with OpenAI Vision API';
    throw new Error(logAxiosError({ error: error as AxiosError, message }));
  }
};

export { performVisionOCR };
