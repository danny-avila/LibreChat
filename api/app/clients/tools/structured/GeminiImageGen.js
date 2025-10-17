const { z } = require('zod');
const fs = require('fs');
const path = require('path');
const { v4 } = require('uuid');
const { Tool } = require('@langchain/core/tools');
const { FileContext, ContentTypes, FileSources } = require('librechat-data-provider');
const { logger } = require('@librechat/data-schemas');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { getFiles } = require('~/models/File');
const { GoogleGenAI } = require('@google/genai');

const displayMessage =
  "Gemini displayed an image. All generated images are already plainly visible, so don't repeat the descriptions in detail. Do not list download links as they are available in the UI already. The user may download the images by clicking on them, but do not mention anything about downloading to the user.";

/**
 * Save base64 image data to storage using processFileURL (GENERIC - works for any image generation tool)
 * @param {Object} params - The parameters object
 * @param {string} params.base64Data - Base64 encoded image data
 * @param {string} params.outputFormat - Image format (png, webp, etc.)
 * @param {Function} params.processFileURL - Function to process file URLs
 * @param {string} params.fileStrategy - File storage strategy (local, s3, azure, firebase)
 * @param {string} params.userId - User ID
 * @returns {Promise<string>} - The file URL in storage
 */
async function saveBase64ImageToStorage({
  base64Data,
  outputFormat,
  processFileURL,
  fileStrategy,
  userId,
}) {
  if (!processFileURL || !fileStrategy || !userId) {
    logger.warn(
      '[GeminiImageGen] Missing required parameters for storage, falling back to data URL',
    );
    return null;
  }

  try {
    // Create a data URL from the base64 data
    const dataURL = `data:image/${outputFormat};base64,${base64Data}`;

    // Generate a unique filename
    const imageName = `gemini-img-${v4()}.${outputFormat}`;

    // Save to storage using processFileURL (works with any file strategy)
    const result = await processFileURL({
      URL: dataURL,
      basePath: 'images',
      userId,
      fileName: imageName,
      fileStrategy,
      context: FileContext.image_generation,
    });

    return result.filepath;
  } catch (error) {
    logger.error('[GeminiImageGen] Error saving image to storage:', error);
    return null;
  }
}

class GeminiImageGen extends Tool {
  constructor(fields = {}) {
    super();
    /** @type {boolean} Used to initialize the Tool without necessary variables. */
    this.override = fields.override ?? false;
    /** @type {boolean} Necessary for output to contain all image metadata. */
    this.returnMetadata = fields.returnMetadata ?? false;

    this.userId = fields.userId;
    this.fileStrategy = fields.fileStrategy;
    /** @type {boolean} */
    this.isAgent = fields.isAgent;
    /** @type {ServerRequest} */
    this.req = fields.req;

    // Extract processFileURL if available
    if (fields.processFileURL) {
      this.processFileURL = fields.processFileURL.bind(this);
    }

    // Store imageFiles for context (copied from OpenAI pattern)
    /** @type {MongoFile[]} */
    this.imageFiles = fields.imageFiles || [];
    // Validate config only if not in override mode
    this.validateConfig();

    this.name = 'gemini_image_gen';

    this.description = `Generates high-quality, original images based on text prompts, with optional image context.

When to use \`gemini_image_gen\`:
- To create entirely new images from detailed text descriptions
- To generate images using existing images as context or inspiration
- When the user requests image generation, creation, or asks to "generate an image"
- When the user asks to "edit", "modify", "change", or "swap" elements in an image (generates new image with changes)

When NOT to use \`gemini_image_gen\`:
- For uploading or saving existing images without modification

Generated image IDs will be returned in the response, so you can refer to them in future requests.`;

    this.description_for_model = `Use this tool to generate images from text descriptions using Vertex AI Gemini.
1. Prompts should be detailed and specific for best results.
2. One image per function call. Create only 1 image per request.
3. IMPORTANT: When user asks to "edit", "modify", "change", or "swap" elements in an existing image:
   - ALWAYS include the original image ID in the image_ids array
   - Describe the desired changes clearly in the prompt
   - The tool will generate a new image based on the original image context + your prompt
4. IMPORTANT: For editing requests, use DIRECT editing instructions:
   - User says "remove the gun" → prompt should be "remove the gun from this image"
   - User says "make it blue" → prompt should be "make this image blue"  
   - User says "add sunglasses" → prompt should be "add sunglasses to this image"
   - DO NOT reconstruct or modify the original prompt - use the user's editing instruction directly
   - ALWAYS include the image being edited in image_ids array
5. OPTIONAL: Use image_ids to provide context images that will influence the generation:
   - Include any relevant image IDs from the conversation in the image_ids array
   - These images will be used as visual context/inspiration for the new generation
   - For "editing" requests, always include the image being "edited"
6. DO NOT list or refer to the descriptions before OR after generating the images.
7. Always mention the image type (photo, oil painting, watercolor painting, illustration, cartoon, drawing, vector, render, etc.) at the beginning of the prompt.

The prompt should be a detailed paragraph describing every part of the image in concrete, objective detail.`;

    this.schema = z.object({
      prompt: z
        .string()
        .max(32000)
        .describe(
          'A detailed text description of the desired image, up to 32000 characters. For "editing" requests, describe the changes you want to make to the referenced image. Be specific about composition, style, lighting, and subject matter.',
        ),
      image_ids: z
        .array(z.string())
        .optional()
        .describe(
          `
Optional array of image IDs to use as visual context for generation.

Guidelines:
- For "editing" requests: ALWAYS include the image ID being "edited"
- For new generation with context: Include any relevant reference image IDs
- If the user's request references any prior images, include their image IDs in this array
- These images will be used as visual context/inspiration for the new generation
- Never invent or hallucinate IDs; only use IDs that are visible in the conversation
- If no images are relevant, omit this field entirely
`.trim(),
        ),
    });
  }

  validateConfig() {
    if (this.override) {
      return;
    }

    // Use same pattern as other Google service integrations
    const credentialsPath =
      process.env.GOOGLE_SERVICE_KEY_FILE ||
      path.join(__dirname, '../../../..', 'data', 'auth.json');
    if (!fs.existsSync(credentialsPath)) {
      throw new Error(`Google credentials file not found at: ${credentialsPath}`);
    }
  }

  wrapInMarkdown(imageUrl) {
    return `![Generated Image](${imageUrl})`;
  }

  replaceUnwantedChars(inputString) {
    return inputString?.replace(/[^\w\s\-_.,!?()]/g, '') || '';
  }

  returnValue(value) {
    if (this.returnMetadata && typeof value === 'object') {
      return value;
    }

    if (this.isAgent) {
      return [displayMessage, value];
    }

    return value;
  }

  /**
   * Check if the API response indicates content was blocked by safety filters
   * @param {Object} response - The Gemini API response
   * @returns {Object|null} - Safety block information or null if not blocked
   */
  checkForSafetyBlock(response) {
    try {
      // Check if response has candidates
      if (!response.candidates || response.candidates.length === 0) {
        return { reason: 'NO_CANDIDATES', message: 'No candidates returned by Gemini' };
      }

      const candidate = response.candidates[0];

      // Check finishReason for safety blocks
      if (candidate.finishReason) {
        const finishReason = candidate.finishReason;

        if (finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
          return {
            reason: finishReason,
            message: 'Content was blocked by Gemini safety filters',
            safetyRatings: candidate.safetyRatings || [],
          };
        }

        if (finishReason === 'RECITATION') {
          return {
            reason: finishReason,
            message: 'Content was blocked due to recitation concerns',
          };
        }
      }

      // Check safety ratings for blocks
      if (candidate.safetyRatings) {
        for (const rating of candidate.safetyRatings) {
          if (rating.probability === 'HIGH' || rating.blocked === true) {
            return {
              reason: 'SAFETY_RATING',
              message: `Content blocked due to ${rating.category} safety concerns`,
              category: rating.category,
              probability: rating.probability,
            };
          }
        }
      }

      return null; // No safety block detected
    } catch (error) {
      logger.error('[GeminiImageGen] Error checking safety block:', error);
      return null;
    }
  }

  async initializeGeminiVertexAI() {
    try {
      // Use same pattern as other Google service integrations
      const credentialsPath =
        process.env.GOOGLE_SERVICE_KEY_FILE ||
        path.join(__dirname, '../../../..', 'data', 'auth.json');

      // Set environment variables for Vertex AI (required by Google GenAI library)
      process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;

      // Load service account credentials
      const serviceKey = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

      // Initialize client
      const ai = new GoogleGenAI({
        vertexai: true,
        project: serviceKey.project_id,
        location: 'global',
      });

      return ai;
    } catch (error) {
      logger.error('[GeminiImageGen] Error initializing Gemini Vertex AI client:', error);
      throw new Error(`Failed to initialize Gemini Vertex AI client: ${error.message}`);
    }
  }

  async saveImageLocally(base64Data, outputFormat = 'png', userId) {
    try {
      // Create unique filename
      const imageName = `gemini-img-${v4()}.${outputFormat}`;

      // Create user-specific directory path for local storage
      const userDir = path.join(process.cwd(), 'client/public/images', userId || 'default');

      // Ensure directory exists
      if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
      }

      // Full file path
      const filePath = path.join(userDir, imageName);

      // Save image file directly
      fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

      // Return relative URL for the frontend
      const relativeUrl = `/images/${userId || 'default'}/${imageName}`;

      logger.debug('[GeminiImageGen] Image saved locally to:', filePath);

      return relativeUrl;
    } catch (error) {
      logger.error('[GeminiImageGen] Error saving image locally:', error);
      throw error;
    }
  }

  /**
   * Convert image file to base64 inlineData format for Gemini (copied and adapted from OpenAI pattern)
   * @param {MongoFile[]} imageFiles - Array of image file objects
   * @param {string[]} image_ids - Array of image IDs to process
   * @returns {Promise<Array>} - Array of inlineData objects for Gemini
   */
  async convertImagesToInlineData(imageFiles, image_ids) {
    if (!image_ids || image_ids.length === 0) {
      return [];
    }

    logger.debug('[GeminiImageGen] Converting images to inlineData format for IDs:', image_ids);

    /** @type {Record<string, any>} */
    const streamMethods = {};
    const requestFilesMap = Object.fromEntries(imageFiles.map((f) => [f.file_id, { ...f }]));
    const orderedFiles = new Array(image_ids.length);
    const idsToFetch = [];
    const indexOfMissing = Object.create(null);

    // Map existing files and identify missing ones (copied from OpenAI)
    for (let i = 0; i < image_ids.length; i++) {
      const id = image_ids[i];
      const file = requestFilesMap[id];

      if (file) {
        orderedFiles[i] = file;
        logger.debug('[GeminiImageGen] Found file in request files:', id);
      } else {
        idsToFetch.push(id);
        indexOfMissing[id] = i;
        logger.debug('[GeminiImageGen] Need to fetch file from database:', id);
      }
    }

    // Fetch missing files from database (copied from OpenAI)
    if (idsToFetch.length) {
      logger.debug('[GeminiImageGen] Fetching', idsToFetch.length, 'files from database');
      const fetchedFiles = await getFiles(
        {
          user: this.req.user.id,
          file_id: { $in: idsToFetch },
          height: { $exists: true },
          width: { $exists: true },
        },
        {},
        {},
      );

      logger.debug('[GeminiImageGen] Fetched', fetchedFiles.length, 'files from database');
      for (const file of fetchedFiles) {
        requestFilesMap[file.file_id] = file;
        orderedFiles[indexOfMissing[file.file_id]] = file;
      }
    }

    // Convert files to Gemini inlineData format
    const inlineDataArray = [];
    for (const imageFile of orderedFiles) {
      if (!imageFile) {
        logger.warn('[GeminiImageGen] Skipping missing image file');
        continue;
      }

      try {
        // Get download stream (copied from OpenAI pattern)
        const source = imageFile.source || this.fileStrategy;
        if (!source) {
          logger.error('[GeminiImageGen] No source found for image file:', imageFile.file_id);
          continue;
        }

        let getDownloadStream;
        if (streamMethods[source]) {
          getDownloadStream = streamMethods[source];
        } else {
          ({ getDownloadStream } = getStrategyFunctions(source));
          streamMethods[source] = getDownloadStream;
        }

        if (!getDownloadStream) {
          logger.error('[GeminiImageGen] No download stream method found for source:', source);
          continue;
        }

        const stream = await getDownloadStream(this.req, imageFile.filepath);
        if (!stream) {
          logger.error(
            '[GeminiImageGen] Failed to get download stream for image:',
            imageFile.file_id,
          );
          continue;
        }

        // Convert stream to buffer then to base64
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        const base64Data = buffer.toString('base64');

        // Determine MIME type
        const mimeType = imageFile.type || 'image/png';

        // Add to inlineData array in Gemini format
        inlineDataArray.push({
          inlineData: {
            mimeType,
            data: base64Data,
          },
        });

        logger.debug('[GeminiImageGen] Converted image to inlineData:', {
          file_id: imageFile.file_id,
          mimeType,
          dataLength: base64Data.length,
        });
      } catch (error) {
        logger.error('[GeminiImageGen] Error processing image file:', imageFile.file_id, error);
        // Continue with other images
      }
    }

    logger.debug(
      '[GeminiImageGen] Successfully converted',
      inlineDataArray.length,
      'images to inlineData',
    );
    return inlineDataArray;
  }

  async _call(data) {
    // Ensure consistent parameter extraction regardless of order
    const prompt = data.prompt;
    const image_ids = data.image_ids;

    if (!prompt) {
      throw new Error('Missing required field: prompt');
    }

    logger.debug('[GeminiImageGen] Generating image with prompt:', prompt);
    logger.debug('[GeminiImageGen] Image IDs provided:', image_ids);
    logger.debug('[GeminiImageGen] Available imageFiles:', this.imageFiles.length);

    let ai;
    try {
      ai = await this.initializeGeminiVertexAI();
    } catch (error) {
      logger.error('[GeminiImageGen] Failed to initialize Gemini Vertex AI:', error);
      return this.returnValue(`Failed to initialize Gemini Vertex AI: ${error.message}`);
    }

    let apiResponse;
    try {
      // Build contents array for the request
      const contents = [{ text: this.replaceUnwantedChars(prompt) }];

      // Add context images if provided (NEW FUNCTIONALITY)
      if (image_ids && image_ids.length > 0) {
        logger.debug('[GeminiImageGen] Processing context images...');
        const contextImages = await this.convertImagesToInlineData(this.imageFiles, image_ids);

        // Add each context image to contents array
        for (const imageData of contextImages) {
          contents.push(imageData);
        }

        logger.debug('[GeminiImageGen] Added', contextImages.length, 'context images to request');
      } else {
        logger.debug('[GeminiImageGen] No image context provided - text-only generation');
      }

      logger.debug('[GeminiImageGen] Final contents array length:', contents.length);

      // Generate image using Gemini Vertex AI with optional image context
      apiResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: contents,
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      });

      logger.debug('[GeminiImageGen] Received response from Gemini Vertex AI');
    } catch (error) {
      logger.error('[GeminiImageGen] Problem generating the image:', error);
      return this
        .returnValue(`Something went wrong when trying to generate the image. The Gemini Vertex AI API may be unavailable:
Error Message: ${error.message}`);
    }

    // Enhanced safety and response checking
    if (!apiResponse || !apiResponse.candidates || !apiResponse.candidates[0]) {
      return this.returnValue(
        'Something went wrong when trying to generate the image. The Gemini Vertex AI API may be unavailable',
      );
    }

    console.log('apiResponse', apiResponse);

    // Check for content safety blocks BEFORE trying to extract image data
    const safetyBlock = this.checkForSafetyBlock(apiResponse);
    if (safetyBlock) {
      logger.warn('[GeminiImageGen] Content blocked by safety filters:', safetyBlock);

      // Provide user-friendly error message based on block reason
      let errorMessage =
        'I cannot generate this image because it was blocked by content safety filters. ';

      if (safetyBlock.reason === 'SAFETY' || safetyBlock.reason === 'PROHIBITED_CONTENT') {
        errorMessage +=
          'The prompt may contain content that violates content policies (such as violence, weapons, or inappropriate content). ';
      } else if (safetyBlock.reason === 'RECITATION') {
        errorMessage += 'The content may be too similar to copyrighted material. ';
      }

      errorMessage += 'Please try rephrasing your request with different, safer content.';

      if (safetyBlock.category) {
        errorMessage += ` (Blocked category: ${safetyBlock.category})`;
      }

      return this.returnValue(errorMessage);
    }

    // Extract image data from response
    const imageData = apiResponse.candidates[0].content.parts.find((part) => part.inlineData)
      ?.inlineData?.data;

    if (!imageData) {
      // Enhanced safety detection and logging
      const candidate = apiResponse.candidates[0];

      // Log detailed response info for debugging
      logger.warn('[GeminiImageGen] No image data in response. Candidate details:', {
        finishReason: candidate.finishReason,
        hasContent: !!candidate.content,
        contentParts: candidate.content?.parts?.length || 0,
        safetyRatings: candidate.safetyRatings?.length || 0,
        contentPartsTypes: candidate.content?.parts?.map((p) => Object.keys(p)) || [],
      });

      // Check for safety ratings to provide specific feedback
      let safetyIssue = null;
      if (candidate.safetyRatings && candidate.safetyRatings.length > 0) {
        for (const rating of candidate.safetyRatings) {
          if (
            rating.probability === 'HIGH' ||
            rating.probability === 'MEDIUM' ||
            rating.blocked === true
          ) {
            safetyIssue = rating;
            break;
          }
        }
      }

      // Create appropriate error message
      let errorMessage;
      if (safetyIssue) {
        errorMessage = `I cannot generate this image because it was blocked by content safety filters. The content was flagged for ${safetyIssue.category} (probability: ${safetyIssue.probability}). Please try rephrasing your request with different, safer content.`;
        logger.warn('[GeminiImageGen] Content blocked by safety filter:', safetyIssue);
      } else if (
        candidate.finishReason === 'SAFETY' ||
        candidate.finishReason === 'PROHIBITED_CONTENT'
      ) {
        errorMessage =
          'I cannot generate this image because it was blocked by content safety filters. Please try rephrasing your request with different, safer content.';
        logger.warn('[GeminiImageGen] Content blocked by finishReason:', candidate.finishReason);
      } else {
        errorMessage =
          'No image was generated. This might be due to content safety filters blocking the request, or the model being unable to create the requested image. Please try rephrasing your prompt with different content.';
        logger.warn('[GeminiImageGen] Unknown reason for missing image data');
      }

      // Return error message in proper agent format
      if (this.isAgent) {
        const errorResponse = [
          {
            type: ContentTypes.TEXT,
            text: errorMessage,
          },
        ];
        return [errorResponse, { content: [], file_ids: [] }];
      } else {
        return this.returnValue(errorMessage);
      }
    }

    logger.debug('[GeminiImageGen] Successfully extracted image data');

    // HYBRID APPROACH: Local strategy uses direct saving, others use OpenAI pattern
    let imageUrl = `data:image/png;base64,${imageData}`;

    if (this.fileStrategy === FileSources.local || this.fileStrategy === 'local') {
      // For local strategy, save directly and use data URL to avoid artifact processing issues
      logger.debug('[GeminiImageGen] Local strategy detected - using direct save + data URL');
      try {
        await this.saveImageLocally(imageData, 'png', this.userId);
        logger.debug('[GeminiImageGen] Image saved locally successfully');
        // Keep using data URL for response to avoid MIME type issues
      } catch (error) {
        logger.error('[GeminiImageGen] Local save failed:', error);
        // Still continue with data URL
      }
    } else {
      // For S3/cloud strategies, follow OpenAI pattern exactly
      logger.debug('[GeminiImageGen] Cloud strategy detected - using OpenAI pattern');
      try {
        const storageUrl = await saveBase64ImageToStorage({
          base64Data: imageData,
          outputFormat: 'png',
          processFileURL: this.processFileURL,
          fileStrategy: this.fileStrategy,
          userId: this.userId,
        });

        if (storageUrl) {
          imageUrl = storageUrl;
          logger.debug('[GeminiImageGen] Image saved to storage:', storageUrl);
        } else {
          logger.warn('[GeminiImageGen] Could not save to storage, using data URL');
        }
      } catch (error) {
        logger.error('[GeminiImageGen] Error saving image to storage:', error);
        logger.warn('[GeminiImageGen] Falling back to data URL');
      }
    }

    // FOLLOW OPENAI RESPONSE PATTERN EXACTLY

    const content = [
      {
        type: ContentTypes.IMAGE_URL,
        image_url: {
          url: imageUrl,
        },
      },
    ];

    const file_ids = [v4()];
    const textResponse = [
      {
        type: ContentTypes.TEXT,
        text:
          displayMessage +
          `\n\ngenerated_image_id: "${file_ids[0]}"` +
          (image_ids && image_ids.length > 0
            ? `\nreferenced_image_ids: ["${image_ids.join('", "')}"]`
            : ''),
      },
    ];

    return [textResponse, { content, file_ids }];
  }
}

module.exports = GeminiImageGen;
