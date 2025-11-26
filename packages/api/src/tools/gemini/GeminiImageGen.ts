import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { StructuredTool } from '@langchain/core/tools';
import { GoogleGenAI } from '@google/genai';
import { FileContext, ContentTypes, FileSources } from 'librechat-data-provider';
import { logger } from '@librechat/data-schemas';
import type { ServerRequest } from '../../types';
import type {
  MongoFile,
  SafetyBlock,
  GeminiResponse,
  GeminiProvider,
  GeminiInlineData,
  GeminiContentPart,
  SaveBase64ImageParams,
  GeminiImageGenFields,
  AgentToolReturn,
  GetFilesFunction,
  GetStrategyFunctionsType,
  GetDownloadStreamFunction,
} from './types';
import {
  TOOL_NAME,
  DISPLAY_MESSAGE,
  TOOL_DESCRIPTION,
  DEFAULT_MODEL_ID,
  PROMPT_DESCRIPTION,
  DESCRIPTION_FOR_MODEL,
  IMAGE_IDS_DESCRIPTION,
} from './constants';

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Save base64 image data to storage using processFileURL
 * Works with any file storage strategy (local, s3, azure, firebase)
 */
export async function saveBase64ImageToStorage({
  base64Data,
  outputFormat,
  processFileURL,
  fileStrategy,
  userId,
}: SaveBase64ImageParams): Promise<string | null> {
  if (!processFileURL || !fileStrategy || !userId) {
    logger.warn(
      '[GeminiImageGen] Missing required parameters for storage, falling back to data URL',
    );
    return null;
  }

  try {
    const dataURL = `data:image/${outputFormat};base64,${base64Data}`;
    const imageName = `gemini-img-${uuidv4()}.${outputFormat}`;

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

/**
 * Replace unwanted characters from prompt text
 */
function replaceUnwantedChars(inputString?: string): string {
  return inputString?.replaceAll(/[^\w\s\-_.,!?()]/g, '') || '';
}

// =============================================================================
// GEMINI IMAGE GENERATION TOOL
// =============================================================================

// Schema definition
const geminiImageGenSchema = z.object({
  prompt: z.string().max(32000).describe(PROMPT_DESCRIPTION),
  image_ids: z.array(z.string()).optional().describe(IMAGE_IDS_DESCRIPTION),
});

export class GeminiImageGen extends StructuredTool<typeof geminiImageGenSchema> {
  name = TOOL_NAME;
  description = TOOL_DESCRIPTION;
  description_for_model = DESCRIPTION_FOR_MODEL;
  schema = geminiImageGenSchema;

  // Configuration
  private readonly overrideConfig: boolean;
  private readonly returnMetadata: boolean;
  private readonly userId?: string;
  private readonly fileStrategy?: string;
  private readonly isAgent: boolean;
  private readonly req?: ServerRequest;
  private readonly processFileURL?: GeminiImageGenFields['processFileURL'];
  private readonly imageFiles: MongoFile[];
  private readonly getFiles?: GetFilesFunction;
  private readonly getStrategyFunctions?: GetStrategyFunctionsType;

  constructor(fields: GeminiImageGenFields = {}) {
    super();

    this.overrideConfig = fields.override ?? false;
    this.returnMetadata = fields.returnMetadata ?? false;
    this.userId = fields.userId;
    this.fileStrategy = fields.fileStrategy;
    this.isAgent = fields.isAgent ?? false;
    this.req = fields.req;
    this.imageFiles = fields.imageFiles || [];
    this.getFiles = fields.getFiles;
    this.getStrategyFunctions = fields.getStrategyFunctions;

    if (fields.processFileURL) {
      this.processFileURL = fields.processFileURL.bind(this);
    }

    this.validateConfig();
  }

  // ===========================================================================
  // CONFIGURATION METHODS
  // ===========================================================================

  /**
   * Determine which provider to use based on configuration
   */
  private getProvider(): GeminiProvider {
    const provider = process.env.GEMINI_IMAGE_PROVIDER?.toLowerCase();
    if (provider === 'gemini' || provider === 'vertex') {
      return provider;
    }
    // Auto-detect: prefer Vertex AI if GOOGLE_SERVICE_KEY_FILE exists and points to a valid file
    const keyFile = process.env.GOOGLE_SERVICE_KEY_FILE;
    if (keyFile && fs.existsSync(keyFile)) {
      return 'vertex';
    }
    return 'gemini';
  }

  /**
   * Get the model ID to use for image generation
   */
  private getModelId(): string {
    return process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL_ID;
  }

  /**
   * Get the credentials file path for Vertex AI
   */
  private getCredentialsPath(): string {
    return (
      process.env.GOOGLE_SERVICE_KEY_FILE || path.join(process.cwd(), 'api', 'data', 'auth.json')
    );
  }

  /**
   * Validate configuration based on provider
   */
  private validateConfig(): void {
    if (this.overrideConfig) {
      return;
    }

    const provider = this.getProvider();

    if (provider === 'gemini') {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error(
          'GEMINI_API_KEY environment variable is required when using Gemini API provider. ' +
            'Set GEMINI_IMAGE_PROVIDER=vertex to use Vertex AI with service account instead.',
        );
      }
    } else {
      const credentialsPath = this.getCredentialsPath();
      if (!fs.existsSync(credentialsPath)) {
        throw new Error(
          `Google service account credentials file not found at: ${credentialsPath}. ` +
            'Set GEMINI_IMAGE_PROVIDER=gemini and GEMINI_API_KEY to use Gemini API instead.',
        );
      }
    }
  }

  // ===========================================================================
  // CLIENT INITIALIZATION
  // ===========================================================================

  /**
   * Initialize the Gemini client based on the configured provider
   */
  private async initializeGeminiClient(): Promise<GoogleGenAI> {
    const provider = this.getProvider();
    const modelId = this.getModelId();

    logger.debug(`[GeminiImageGen] Using provider: ${provider}, model: ${modelId}`);

    try {
      if (provider === 'gemini') {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          throw new Error(
            'GEMINI_API_KEY environment variable is required for Gemini API provider',
          );
        }
        logger.debug('[GeminiImageGen] Initializing Gemini API client with API key');
        return new GoogleGenAI({ apiKey });
      }

      // Vertex AI with service account
      logger.debug('[GeminiImageGen] Initializing Vertex AI client with service account');
      const credentialsPath = this.getCredentialsPath();

      if (!fs.existsSync(credentialsPath)) {
        throw new Error(`Google service account credentials file not found at: ${credentialsPath}`);
      }

      process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;

      let serviceKey;
      try {
        serviceKey = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      } catch (parseError) {
        throw new Error(
          `Malformed JSON in Google service account credentials file at ${credentialsPath}: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        );
      }

      return new GoogleGenAI({
        vertexai: true,
        project: serviceKey.project_id,
        location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
      });
    } catch (error) {
      logger.error('[GeminiImageGen] Error initializing Gemini client:', error);
      throw new Error(
        `Failed to initialize Gemini client: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ===========================================================================
  // SAFETY CHECKING
  // ===========================================================================

  /**
   * Check if the API response indicates content was blocked by safety filters
   */
  private checkForSafetyBlock(response: GeminiResponse): SafetyBlock | null {
    try {
      if (!response.candidates || response.candidates.length === 0) {
        return { reason: 'NO_CANDIDATES', message: 'No candidates returned by Gemini' };
      }

      const candidate = response.candidates[0];

      // Check finishReason for safety blocks
      if (candidate.finishReason) {
        const { finishReason } = candidate;

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

      return null;
    } catch (error) {
      logger.error('[GeminiImageGen] Error checking safety block:', error);
      return null;
    }
  }

  /**
   * Create user-friendly error message for safety blocks
   */
  private createSafetyErrorMessage(safetyBlock: SafetyBlock): string {
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

    return errorMessage;
  }

  // ===========================================================================
  // IMAGE PROCESSING
  // ===========================================================================

  /**
   * Save image locally for local file strategy
   */
  private async saveImageLocally(
    base64Data: string,
    outputFormat: string = 'png',
    userId?: string,
  ): Promise<string> {
    try {
      const imageName = `gemini-img-${uuidv4()}.${outputFormat}`;
      const userDir = path.join(process.cwd(), 'client/public/images', userId || 'default');

      if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
      }

      const filePath = path.join(userDir, imageName);
      const imageBuffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(filePath, new Uint8Array(imageBuffer));

      const relativeUrl = `/images/${userId || 'default'}/${imageName}`;
      logger.debug('[GeminiImageGen] Image saved locally to:', filePath);

      return relativeUrl;
    } catch (error) {
      logger.error('[GeminiImageGen] Error saving image locally:', error);
      throw error;
    }
  }

  /**
   * Convert image files to Gemini inlineData format
   */
  private async convertImagesToInlineData(
    imageFiles: MongoFile[],
    image_ids: string[],
  ): Promise<GeminiInlineData[]> {
    if (!image_ids || image_ids.length === 0) {
      return [];
    }

    logger.debug('[GeminiImageGen] Converting images to inlineData format for IDs:', image_ids);

    const streamMethods: Record<string, GetDownloadStreamFunction> = {};
    const requestFilesMap = Object.fromEntries(imageFiles.map((f) => [f.file_id, { ...f }]));
    const orderedFiles: (MongoFile | undefined)[] = new Array(image_ids.length);
    const idsToFetch: string[] = [];
    const indexOfMissing: Record<string, number> = Object.create(null);

    // Map existing files and identify missing ones
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

    // Fetch missing files from database
    if (idsToFetch.length && this.req?.user?.id && this.getFiles) {
      logger.debug('[GeminiImageGen] Fetching', idsToFetch.length, 'files from database');
      const fetchedFiles = await this.getFiles(
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
    const inlineDataArray: GeminiInlineData[] = [];

    for (const imageFile of orderedFiles) {
      if (!imageFile) {
        logger.warn('[GeminiImageGen] Skipping missing image file');
        continue;
      }

      try {
        const source = imageFile.source || this.fileStrategy;
        if (!source) {
          logger.error('[GeminiImageGen] No source found for image file:', imageFile.file_id);
          continue;
        }

        let getDownloadStream: GetDownloadStreamFunction | undefined;
        if (streamMethods[source]) {
          getDownloadStream = streamMethods[source];
        } else if (this.getStrategyFunctions) {
          const functions = this.getStrategyFunctions(source);
          getDownloadStream = functions.getDownloadStream;
          streamMethods[source] = getDownloadStream;
        }

        if (!getDownloadStream || !this.req) {
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
        const chunks: Uint8Array[] = [];
        for await (const chunk of stream) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          chunks.push(new Uint8Array(buf));
        }
        const buffer = Buffer.concat(chunks);
        const base64Data = buffer.toString('base64');

        const mimeType = imageFile.type || 'image/png';

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
      }
    }

    logger.debug(
      '[GeminiImageGen] Successfully converted',
      inlineDataArray.length,
      'images to inlineData',
    );
    return inlineDataArray;
  }

  // ===========================================================================
  // RESPONSE HANDLING
  // ===========================================================================

  /**
   * Return value in appropriate format based on configuration
   */
  private returnValue<T>(value: T): T | [string, T] {
    if (this.returnMetadata && typeof value === 'object') {
      return value;
    }

    if (this.isAgent) {
      return [DISPLAY_MESSAGE, value] as [string, T];
    }

    return value;
  }

  /**
   * Create error response in appropriate format
   */
  private createErrorResponse(errorMessage: string): AgentToolReturn | string {
    if (this.isAgent) {
      const errorResponse = [
        {
          type: ContentTypes.TEXT,
          text: errorMessage,
        },
      ];
      return [errorResponse, { content: [], file_ids: [] }];
    }
    return this.returnValue(errorMessage) as string;
  }

  // ===========================================================================
  // MAIN EXECUTION
  // ===========================================================================

  async _call(
    data: z.infer<typeof geminiImageGenSchema>,
  ): Promise<AgentToolReturn | string | [string, unknown]> {
    const { prompt, image_ids } = data;

    if (!prompt) {
      throw new Error('Missing required field: prompt');
    }

    logger.debug('[GeminiImageGen] Generating image with prompt:', prompt);
    logger.debug('[GeminiImageGen] Image IDs provided:', image_ids);
    logger.debug('[GeminiImageGen] Available imageFiles:', this.imageFiles.length);

    // Initialize client
    let ai: GoogleGenAI;
    try {
      ai = await this.initializeGeminiClient();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('[GeminiImageGen] Failed to initialize Gemini client:', error);
      return this.createErrorResponse(`Failed to initialize Gemini client: ${errorMsg}`);
    }

    // Build request contents
    const contents: GeminiContentPart[] = [{ text: replaceUnwantedChars(prompt) }];

    // Add context images if provided
    if (image_ids && image_ids.length > 0) {
      logger.debug('[GeminiImageGen] Processing context images...');
      const contextImages = await this.convertImagesToInlineData(this.imageFiles, image_ids);

      for (const imageData of contextImages) {
        contents.push(imageData);
      }

      logger.debug('[GeminiImageGen] Added', contextImages.length, 'context images to request');
    } else {
      logger.debug('[GeminiImageGen] No image context provided - text-only generation');
    }

    logger.debug('[GeminiImageGen] Final contents array length:', contents.length);

    // Generate image
    let apiResponse: GeminiResponse;
    try {
      const modelId = this.getModelId();
      apiResponse = (await ai.models.generateContent({
        model: modelId,
        contents: contents,
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      })) as GeminiResponse;

      logger.debug(`[GeminiImageGen] Received response from Gemini (model: ${modelId})`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('[GeminiImageGen] Problem generating the image:', error);
      return this.createErrorResponse(
        `Something went wrong when trying to generate the image. The Gemini API may be unavailable:\nError Message: ${errorMsg}`,
      );
    }

    // Validate response
    if (!apiResponse?.candidates?.[0]) {
      return this.createErrorResponse(
        'Something went wrong when trying to generate the image. The Gemini API may be unavailable',
      );
    }

    // Check for safety blocks
    const safetyBlock = this.checkForSafetyBlock(apiResponse);
    if (safetyBlock) {
      logger.warn('[GeminiImageGen] Content blocked by safety filters:', safetyBlock);
      return this.createErrorResponse(this.createSafetyErrorMessage(safetyBlock));
    }

    // Extract image data
    const imageData = apiResponse.candidates[0].content?.parts?.find((part) => part.inlineData)
      ?.inlineData?.data;

    if (!imageData) {
      return this.handleMissingImageData(apiResponse);
    }

    logger.debug('[GeminiImageGen] Successfully extracted image data');

    // Save image and create response
    const imageUrl = await this.saveGeneratedImage(imageData);

    // Build response in OpenAI-compatible format
    const content = [
      {
        type: ContentTypes.IMAGE_URL,
        image_url: { url: imageUrl },
      },
    ];

    const file_ids = [uuidv4()];
    const textResponse = [
      {
        type: ContentTypes.TEXT,
        text:
          DISPLAY_MESSAGE +
          `\n\ngenerated_image_id: "${file_ids[0]}"` +
          (image_ids && image_ids.length > 0
            ? `\nreferenced_image_ids: ["${image_ids.join('", "')}"]`
            : ''),
      },
    ];

    return [textResponse, { content, file_ids }];
  }

  /**
   * Handle case where no image data is returned
   */
  private handleMissingImageData(apiResponse: GeminiResponse): AgentToolReturn | string {
    const candidate = apiResponse.candidates![0];

    logger.warn('[GeminiImageGen] No image data in response. Candidate details:', {
      finishReason: candidate.finishReason,
      hasContent: !!candidate.content,
      contentParts: candidate.content?.parts?.length || 0,
      safetyRatings: candidate.safetyRatings?.length || 0,
      contentPartsTypes: candidate.content?.parts?.map((p) => Object.keys(p)) || [],
    });

    // Check for safety ratings
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

    let errorMessage: string;
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

    return this.createErrorResponse(errorMessage);
  }

  /**
   * Save generated image using appropriate strategy
   */
  private async saveGeneratedImage(imageData: string): Promise<string> {
    let imageUrl = `data:image/png;base64,${imageData}`;

    if (this.fileStrategy === FileSources.local || this.fileStrategy === 'local') {
      logger.debug('[GeminiImageGen] Local strategy detected - using direct save + data URL');
      try {
        await this.saveImageLocally(imageData, 'png', this.userId);
        logger.debug('[GeminiImageGen] Image saved locally successfully');
      } catch (error) {
        logger.error('[GeminiImageGen] Local save failed:', error);
      }
    } else {
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

    return imageUrl;
  }
}

export default GeminiImageGen;
