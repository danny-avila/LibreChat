const fs = require('fs');
const path = require('path');
const { FileSources, envVarRegex, extractEnvVariable } = require('librechat-data-provider');

const { createAxiosInstance, logAxiosError } = require('@librechat/api');
const { logger } = require('~/config');

const axios = createAxiosInstance();

/**
 * Uses GPT-4o Vision to extract text from an image or document
 *
 * @param {Object} params Upload parameters
 * @param {string} params.filePath The path to the file on disk
 * @param {string} params.apiKey OpenAI API key
 * @param {string} [params.baseURL=https://api.openai.com/v1] OpenAI API base URL
 * @param {string} [params.model=gpt-4o] Vision model to use for OCR
 * @returns {Promise<Object>} The response from OpenAI API
 */
async function performVisionOCR({
  filePath,
  apiKey,
  baseURL = 'https://api.openai.com/v1',
  model = 'gpt-4o',
}) {
  try {
    // Read file to base64
    const fileBuffer = fs.readFileSync(filePath);
    const base64Image = fileBuffer.toString('base64');

    // Determine the correct MIME type based on file extension
    const ext = path.extname(filePath).toLowerCase();
    let mimeType;

    // Only allow supported image types for vision API
    // PDF files need special handling that we're not implementing yet
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
        // Default to PNG for unknown types, but log a warning

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
  } catch (error) {
    logger.error(`[OpenAI Vision OCR] Error in performVisionOCR: ${error.message}`, error);
    // Provide more specific error messages based on error type
    if (error.response) {
      const status = error.response.status;
      if (status === 401) {
        throw new Error('Authentication error: Invalid API key');
      } else if (status === 429) {
        throw new Error('Rate limit exceeded: Too many requests to OpenAI API');
      } else if (status === 500) {
        throw new Error('OpenAI server error: Try again later');
      }
    }
    throw error;
  }
}

/**
 * Uploads a file for OCR processing using OpenAI Vision
 *
 * @param {Object} params - The params object.
 * @param {ServerRequest} params.req - The request object
 * @param {Express.Multer.File} params.file - The file object
 * @returns {Promise<{ filepath: string, bytes: number, text: string }>} - The OCR result
 */
const uploadOpenAIVisionOCR = async ({ req, file }) => {
  try {
    /** @type {TCustomConfig['ocr']} */
    const ocrConfig = req.config?.ocr;
    const modelConfig = ocrConfig.visionModel || '';
    const isModelEnvVar = envVarRegex.test(modelConfig);
    let apiKey, baseURL, model;

    // Always use server environment variables for OCR
    apiKey = process.env.OPENAI_API_KEY;
    baseURL = process.env.OPENAI_API_HOST || 'https://api.openai.com/v1';

    if (!apiKey) {
      logger.error('[OpenAI Vision OCR Debug] Missing OPENAI_API_KEY in server environment');
      throw new Error('OpenAI API key not configured on server');
    }

    logger.info('[OpenAI Vision OCR Debug] Using server configuration', {
      hasApiKey: !!apiKey,
      baseURL,
    });

    model = isModelEnvVar ? extractEnvVariable(modelConfig) : modelConfig.trim() || 'gpt-4o';

    logger.info(`[OpenAI Vision OCR] Using model: ${model}`);

    // Check if file is a supported image type for vision API
    const ext = path.extname(file.path).toLowerCase();
    const supportedImageExts = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

    if (!supportedImageExts.has(ext)) {
      const error = `Unsupported file type for Vision OCR: ${ext}. Only image types ${Array.from(supportedImageExts).join(', ')} are supported.`;
      logger.error(`[OpenAI Vision OCR] ${error}`);
      throw new Error(error);
    }

    const ocrResult = await performVisionOCR({
      filePath: file.path,
      apiKey,
      baseURL,
      model,
    });

    // Extract text from OpenAI response
    const extractedText = ocrResult.choices[0].message.content;

    return {
      filename: file.originalname,
      bytes: extractedText.length * 4,
      filepath: FileSources.openai_vision_ocr,
      text: extractedText,
      // Note: we don't extract images since this is a text extraction service
      images: [],
    };
  } catch (error) {
    logger.error(`[OpenAI Vision OCR] Error in uploadOpenAIVisionOCR: ${error.message}`, error);
    const message = 'Error performing OCR with OpenAI Vision API';
    throw new Error(logAxiosError({ error, message }));
  }
};

module.exports = {
  performVisionOCR,
  uploadOpenAIVisionOCR,
};
