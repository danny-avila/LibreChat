const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { v4 } = require('uuid');
const { ProxyAgent } = require('undici');
const { GoogleGenAI } = require('@google/genai');
const { tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');
const {
  FileContext,
  ContentTypes,
  FileSources,
  EImageOutputType,
} = require('librechat-data-provider');
const {
  geminiToolkit,
  loadServiceKey,
  getBalanceConfig,
  getTransactionsConfig,
} = require('@librechat/api');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { spendTokens, getFiles } = require('~/models');

/**
 * Configure proxy support for Google APIs
 * This wraps globalThis.fetch to add a proxy dispatcher only for googleapis.com URLs
 * This is necessary because @google/genai SDK doesn't support custom fetch or httpOptions.dispatcher
 */
if (process.env.PROXY) {
  const originalFetch = globalThis.fetch;
  const proxyAgent = new ProxyAgent(process.env.PROXY);

  globalThis.fetch = function (url, options = {}) {
    const urlString = url.toString();
    if (urlString.includes('googleapis.com')) {
      options = { ...options, dispatcher: proxyAgent };
    }
    return originalFetch.call(this, url, options);
  };
}

/**
 * Get the default service key file path (consistent with main Google endpoint)
 * @returns {string} - The default path to the service key file
 */
function getDefaultServiceKeyPath() {
  return (
    process.env.GOOGLE_SERVICE_KEY_FILE || path.join(process.cwd(), 'api', 'data', 'auth.json')
  );
}

const displayMessage =
  "Gemini displayed an image. All generated images are already plainly visible, so don't repeat the descriptions in detail. Do not list download links as they are available in the UI already. The user may download the images by clicking on them, but do not mention anything about downloading to the user.";

/**
 * Replaces unwanted characters from the input string
 * @param {string} inputString - The input string to process
 * @returns {string} - The processed string
 */
function replaceUnwantedChars(inputString) {
  return inputString?.replace(/[^\w\s\-_.,!?()]/g, '') || '';
}

/**
 * Validate and sanitize image format
 * @param {string} format - The format to validate
 * @returns {string} - Safe format
 */
function getSafeFormat(format) {
  const allowedFormats = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
  return allowedFormats.includes(format?.toLowerCase()) ? format.toLowerCase() : 'png';
}

/**
 * Convert image buffer to target format if needed
 * @param {Buffer} inputBuffer - The input image buffer
 * @param {string} targetFormat - The target format (png, jpeg, webp)
 * @returns {Promise<{buffer: Buffer, format: string}>} - Converted buffer and format
 */
async function convertImageFormat(inputBuffer, targetFormat) {
  const metadata = await sharp(inputBuffer).metadata();
  const currentFormat = metadata.format;

  // Normalize format names (jpg -> jpeg)
  const normalizedTarget = targetFormat === 'jpg' ? 'jpeg' : targetFormat.toLowerCase();
  const normalizedCurrent = currentFormat === 'jpg' ? 'jpeg' : currentFormat;

  // If already in target format, return as-is
  if (normalizedCurrent === normalizedTarget) {
    return { buffer: inputBuffer, format: normalizedTarget };
  }

  // Convert to target format
  const convertedBuffer = await sharp(inputBuffer).toFormat(normalizedTarget).toBuffer();
  return { buffer: convertedBuffer, format: normalizedTarget };
}

/**
 * Initialize Gemini client (supports both Gemini API and Vertex AI)
 * Priority: API key (from options, resolved by loadAuthValues) > Vertex AI service account
 * @param {Object} options - Initialization options
 * @param {string} [options.GEMINI_API_KEY] - Gemini API key (resolved by loadAuthValues)
 * @param {string} [options.GOOGLE_KEY] - Google API key (resolved by loadAuthValues)
 * @returns {Promise<GoogleGenAI>} - The initialized client
 */
async function initializeGeminiClient(options = {}) {
  const geminiKey = options.GEMINI_API_KEY;
  if (geminiKey) {
    logger.debug('[GeminiImageGen] Using Gemini API with GEMINI_API_KEY');
    return new GoogleGenAI({ apiKey: geminiKey });
  }

  const googleKey = options.GOOGLE_KEY;
  if (googleKey) {
    logger.debug('[GeminiImageGen] Using Gemini API with GOOGLE_KEY');
    return new GoogleGenAI({ apiKey: googleKey });
  }

  // Fall back to Vertex AI with service account
  logger.debug('[GeminiImageGen] Using Vertex AI with service account');
  const credentialsPath = getDefaultServiceKeyPath();

  // Use loadServiceKey for consistent loading (supports file paths, JSON strings, base64)
  const serviceKey = await loadServiceKey(credentialsPath);

  if (!serviceKey || !serviceKey.project_id) {
    throw new Error(
      'Gemini Image Generation requires one of: user-provided API key, GEMINI_API_KEY or GOOGLE_KEY env var, or a valid Google service account. ' +
        `Service account file not found or invalid at: ${credentialsPath}`,
    );
  }

  // Set GOOGLE_APPLICATION_CREDENTIALS for any Google Cloud SDK dependencies
  try {
    await fs.promises.access(credentialsPath);
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
  } catch {
    // File doesn't exist, skip setting env var
  }

  return new GoogleGenAI({
    vertexai: true,
    project: serviceKey.project_id,
    location: process.env.GOOGLE_LOC || process.env.GOOGLE_CLOUD_LOCATION || 'global',
  });
}

/**
 * Save image to local filesystem
 * @param {string} base64Data - Base64 encoded image data
 * @param {string} format - Image format
 * @param {string} userId - User ID
 * @returns {Promise<string>} - The relative URL
 */
async function saveImageLocally(base64Data, format, userId) {
  const safeFormat = getSafeFormat(format);
  const safeUserId = userId ? path.basename(userId) : 'default';
  const imageName = `gemini-img-${v4()}.${safeFormat}`;
  const userDir = path.join(process.cwd(), 'client/public/images', safeUserId);

  await fs.promises.mkdir(userDir, { recursive: true });

  const filePath = path.join(userDir, imageName);
  await fs.promises.writeFile(filePath, Buffer.from(base64Data, 'base64'));

  logger.debug('[GeminiImageGen] Image saved locally to:', filePath);
  return `/images/${safeUserId}/${imageName}`;
}

/**
 * Save image to cloud storage
 * @param {Object} params - Parameters
 * @returns {Promise<string|null>} - The storage URL or null
 */
async function saveToCloudStorage({ base64Data, format, processFileURL, fileStrategy, userId }) {
  if (!processFileURL || !fileStrategy || !userId) {
    return null;
  }

  try {
    const safeFormat = getSafeFormat(format);
    const safeUserId = path.basename(userId);
    const dataURL = `data:image/${safeFormat};base64,${base64Data}`;
    const imageName = `gemini-img-${v4()}.${safeFormat}`;

    const result = await processFileURL({
      URL: dataURL,
      basePath: 'images',
      userId: safeUserId,
      fileName: imageName,
      fileStrategy,
      context: FileContext.image_generation,
    });

    return result.filepath;
  } catch (error) {
    logger.error('[GeminiImageGen] Error saving to cloud storage:', error);
    return null;
  }
}

/**
 * Convert image files to Gemini inline data format
 * @param {Object} params - Parameters
 * @returns {Promise<Array>} - Array of inline data objects
 */
async function convertImagesToInlineData({ imageFiles, image_ids, req, fileStrategy }) {
  if (!image_ids || image_ids.length === 0) {
    return [];
  }

  const streamMethods = {};
  const requestFilesMap = Object.fromEntries(imageFiles.map((f) => [f.file_id, { ...f }]));
  const orderedFiles = new Array(image_ids.length);
  const idsToFetch = [];
  const indexOfMissing = Object.create(null);

  for (let i = 0; i < image_ids.length; i++) {
    const id = image_ids[i];
    const file = requestFilesMap[id];
    if (file) {
      orderedFiles[i] = file;
    } else {
      idsToFetch.push(id);
      indexOfMissing[id] = i;
    }
  }

  if (idsToFetch.length && req?.user?.id) {
    const fetchedFiles = await getFiles(
      {
        user: req.user.id,
        file_id: { $in: idsToFetch },
        height: { $exists: true },
        width: { $exists: true },
      },
      {},
      {},
    );

    for (const file of fetchedFiles) {
      requestFilesMap[file.file_id] = file;
      orderedFiles[indexOfMissing[file.file_id]] = file;
    }
  }

  const inlineDataArray = [];
  for (const imageFile of orderedFiles) {
    if (!imageFile) continue;

    try {
      const source = imageFile.source || fileStrategy;
      if (!source) continue;

      let getDownloadStream = streamMethods[source];
      if (!getDownloadStream) {
        ({ getDownloadStream } = getStrategyFunctions(source));
        streamMethods[source] = getDownloadStream;
      }
      if (!getDownloadStream) continue;

      const stream = await getDownloadStream(req, imageFile.filepath);
      if (!stream) continue;

      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const base64Data = buffer.toString('base64');
      const mimeType = imageFile.type || 'image/png';

      inlineDataArray.push({
        inlineData: { mimeType, data: base64Data },
      });
    } catch (error) {
      logger.error('[GeminiImageGen] Error processing image:', imageFile.file_id, error);
    }
  }

  return inlineDataArray;
}

/**
 * Check for safety blocks in API response
 * @param {Object} response - The API response
 * @returns {Object|null} - Safety block info or null
 */
function checkForSafetyBlock(response) {
  if (!response?.candidates?.length) {
    return { reason: 'NO_CANDIDATES', message: 'No candidates returned' };
  }

  const candidate = response.candidates[0];
  const finishReason = candidate.finishReason;

  if (finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
    return { reason: finishReason, message: 'Content blocked by safety filters' };
  }

  if (finishReason === 'RECITATION') {
    return { reason: finishReason, message: 'Content blocked due to recitation concerns' };
  }

  if (candidate.safetyRatings) {
    for (const rating of candidate.safetyRatings) {
      if (rating.probability === 'HIGH' || rating.blocked === true) {
        return {
          reason: 'SAFETY_RATING',
          message: `Blocked due to ${rating.category}`,
          category: rating.category,
        };
      }
    }
  }

  return null;
}

/**
 * Record token usage for balance tracking
 * @param {Object} params - Parameters
 * @param {Object} params.usageMetadata - The usage metadata from API response
 * @param {Object} params.req - The request object
 * @param {string} params.userId - The user ID
 * @param {string} params.conversationId - The conversation ID
 * @param {string} params.model - The model name
 */
async function recordTokenUsage({ usageMetadata, req, userId, conversationId, model }) {
  if (!usageMetadata) {
    logger.debug('[GeminiImageGen] No usage metadata available for balance tracking');
    return;
  }

  const appConfig = req?.config;
  const balance = getBalanceConfig(appConfig);
  const transactions = getTransactionsConfig(appConfig);

  // Skip if neither balance nor transactions are enabled
  if (!balance?.enabled && transactions?.enabled === false) {
    return;
  }

  const promptTokens = usageMetadata.prompt_token_count || usageMetadata.promptTokenCount || 0;
  const completionTokens =
    usageMetadata.candidates_token_count || usageMetadata.candidatesTokenCount || 0;

  if (promptTokens === 0 && completionTokens === 0) {
    logger.debug('[GeminiImageGen] No tokens to record');
    return;
  }

  logger.debug('[GeminiImageGen] Recording token usage:', {
    promptTokens,
    completionTokens,
    model,
    conversationId,
  });

  try {
    await spendTokens(
      {
        user: userId,
        model,
        conversationId,
        context: 'image_generation',
        balance,
        transactions,
      },
      {
        promptTokens,
        completionTokens,
      },
    );
  } catch (error) {
    logger.error('[GeminiImageGen] Error recording token usage:', error);
  }
}

/**
 * Creates Gemini Image Generation tool
 * @param {Object} fields - Configuration fields
 * @returns {ReturnType<tool>} - The image generation tool
 */
function createGeminiImageTool(fields = {}) {
  const override = fields.override ?? false;

  if (!override && !fields.isAgent) {
    throw new Error('This tool is only available for agents.');
  }

  // Skip validation during tool creation - validation happens at runtime in initializeGeminiClient
  // This allows the tool to be added to agents when using Vertex AI without requiring API keys
  // The actual credentials check happens when the tool is invoked

  const {
    req,
    imageFiles = [],
    processFileURL,
    userId,
    fileStrategy,
    GEMINI_API_KEY,
    GOOGLE_KEY,
    // GEMINI_VERTEX_ENABLED is used for auth validation only (not used in code)
    // When set as env var, it signals Vertex AI is configured and bypasses API key requirement
  } = fields;

  const imageOutputType = fields.imageOutputType || EImageOutputType.PNG;

  const geminiImageGenTool = tool(
    async ({ prompt, image_ids, aspectRatio, imageSize }, _runnableConfig) => {
      if (!prompt) {
        throw new Error('Missing required field: prompt');
      }

      logger.debug('[GeminiImageGen] Generating image with prompt:', prompt?.substring(0, 100));
      logger.debug('[GeminiImageGen] Options:', { aspectRatio, imageSize });

      // Initialize Gemini client with user-provided credentials
      let ai;
      try {
        ai = await initializeGeminiClient({
          GEMINI_API_KEY,
          GOOGLE_KEY,
        });
      } catch (error) {
        logger.error('[GeminiImageGen] Failed to initialize client:', error);
        return [
          [{ type: ContentTypes.TEXT, text: `Failed to initialize Gemini: ${error.message}` }],
          { content: [], file_ids: [] },
        ];
      }

      // Build request contents
      const contents = [{ text: replaceUnwantedChars(prompt) }];

      // Add context images if provided
      if (image_ids?.length > 0) {
        const contextImages = await convertImagesToInlineData({
          imageFiles,
          image_ids,
          req,
          fileStrategy,
        });
        contents.push(...contextImages);
        logger.debug('[GeminiImageGen] Added', contextImages.length, 'context images');
      }

      // Generate image
      let apiResponse;
      const geminiModel = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
      try {
        // Build config with optional imageConfig
        const config = {
          responseModalities: ['TEXT', 'IMAGE'],
        };

        // Add imageConfig if aspectRatio or imageSize is specified
        // Note: gemini-2.5-flash-image doesn't support imageSize
        const supportsImageSize = !geminiModel.includes('gemini-2.5-flash-image');
        if (aspectRatio || (imageSize && supportsImageSize)) {
          config.imageConfig = {};
          if (aspectRatio) {
            config.imageConfig.aspectRatio = aspectRatio;
          }
          if (imageSize && supportsImageSize) {
            config.imageConfig.imageSize = imageSize;
          }
        }

        apiResponse = await ai.models.generateContent({
          model: geminiModel,
          contents,
          config,
        });
      } catch (error) {
        logger.error('[GeminiImageGen] API error:', error);
        return [
          [{ type: ContentTypes.TEXT, text: `Image generation failed: ${error.message}` }],
          { content: [], file_ids: [] },
        ];
      }

      // Check for safety blocks
      const safetyBlock = checkForSafetyBlock(apiResponse);
      if (safetyBlock) {
        logger.warn('[GeminiImageGen] Safety block:', safetyBlock);
        const errorMsg = 'Image blocked by content safety filters. Please try different content.';
        return [[{ type: ContentTypes.TEXT, text: errorMsg }], { content: [], file_ids: [] }];
      }

      const rawImageData = apiResponse.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)
        ?.inlineData?.data;

      if (!rawImageData) {
        logger.warn('[GeminiImageGen] No image data in response');
        return [
          [{ type: ContentTypes.TEXT, text: 'No image was generated. Please try again.' }],
          { content: [], file_ids: [] },
        ];
      }

      const rawBuffer = Buffer.from(rawImageData, 'base64');
      const { buffer: convertedBuffer, format: outputFormat } = await convertImageFormat(
        rawBuffer,
        imageOutputType,
      );
      const imageData = convertedBuffer.toString('base64');
      const mimeType = outputFormat === 'jpeg' ? 'image/jpeg' : `image/${outputFormat}`;

      logger.debug('[GeminiImageGen] Image format:', { outputFormat, mimeType });

      let imageUrl;
      const useLocalStorage = !fileStrategy || fileStrategy === FileSources.local;

      if (useLocalStorage) {
        try {
          imageUrl = await saveImageLocally(imageData, outputFormat, userId);
        } catch (error) {
          logger.error('[GeminiImageGen] Local save failed:', error);
          imageUrl = `data:${mimeType};base64,${imageData}`;
        }
      } else {
        const cloudUrl = await saveToCloudStorage({
          base64Data: imageData,
          format: outputFormat,
          processFileURL,
          fileStrategy,
          userId,
        });

        if (cloudUrl) {
          imageUrl = cloudUrl;
        } else {
          // Fallback to local
          try {
            imageUrl = await saveImageLocally(imageData, outputFormat, userId);
          } catch (_error) {
            imageUrl = `data:${mimeType};base64,${imageData}`;
          }
        }
      }

      logger.debug('[GeminiImageGen] Image URL:', imageUrl);

      // For the artifact, we need a data URL (same as OpenAI)
      // The local file save is for persistence, but the response needs a data URL
      const dataUrl = `data:${mimeType};base64,${imageData}`;

      // Return in content_and_artifact format (same as OpenAI)
      const file_ids = [v4()];
      const content = [
        {
          type: ContentTypes.IMAGE_URL,
          image_url: { url: dataUrl },
        },
      ];

      const textResponse = [
        {
          type: ContentTypes.TEXT,
          text:
            displayMessage +
            `\n\ngenerated_image_id: "${file_ids[0]}"` +
            (image_ids?.length > 0 ? `\nreferenced_image_ids: ["${image_ids.join('", "')}"]` : ''),
        },
      ];

      // Record token usage for balance tracking (don't await to avoid blocking response)
      const conversationId = _runnableConfig?.configurable?.thread_id;
      recordTokenUsage({
        usageMetadata: apiResponse.usageMetadata,
        req,
        userId,
        conversationId,
        model: geminiModel,
      }).catch((error) => {
        logger.error('[GeminiImageGen] Failed to record token usage:', error);
      });

      return [textResponse, { content, file_ids }];
    },
    {
      ...geminiToolkit.gemini_image_gen,
      responseFormat: 'content_and_artifact',
    },
  );

  return geminiImageGenTool;
}

// Export both for compatibility
module.exports = createGeminiImageTool;
module.exports.createGeminiImageTool = createGeminiImageTool;
