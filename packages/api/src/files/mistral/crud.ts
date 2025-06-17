import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import { logger } from '@librechat/data-schemas';
import {
  FileSources,
  envVarRegex,
  extractEnvVariable,
  extractVariableName,
} from 'librechat-data-provider';
import type { TCustomConfig } from 'librechat-data-provider';
import type { Request as ServerRequest } from 'express';
import type { AxiosError } from 'axios';
import type {
  MistralFileUploadResponse,
  MistralSignedUrlResponse,
  MistralOCRUploadResult,
  MistralOCRError,
  OCRResultPage,
  OCRResult,
  OCRImage,
} from '~/types';
import { logAxiosError, createAxiosInstance } from '~/utils/axios';

const axios = createAxiosInstance();
const DEFAULT_MISTRAL_BASE_URL = 'https://api.mistral.ai/v1';
const DEFAULT_MISTRAL_MODEL = 'mistral-ocr-latest';

/** Helper type for auth configuration */
interface AuthConfig {
  apiKey: string;
  baseURL: string;
}

/** Helper type for OCR request context */
interface OCRContext {
  req: Pick<ServerRequest, 'user' | 'app'> & {
    user?: { id: string };
    app: {
      locals?: {
        ocr?: TCustomConfig['ocr'];
      };
    };
  };
  file: Express.Multer.File;
  loadAuthValues: (params: {
    userId: string;
    authFields: string[];
    optional?: Set<string>;
  }) => Promise<Record<string, string | undefined>>;
}

/**
 * Uploads a document to Mistral API using file streaming to avoid loading the entire file into memory
 * @param params Upload parameters
 * @param params.filePath The path to the file on disk
 * @param params.fileName Optional filename to use (defaults to the name from filePath)
 * @param params.apiKey Mistral API key
 * @param params.baseURL Mistral API base URL
 * @returns The response from Mistral API
 */
export async function uploadDocumentToMistral({
  apiKey,
  filePath,
  baseURL = DEFAULT_MISTRAL_BASE_URL,
  fileName = '',
}: {
  apiKey: string;
  filePath: string;
  baseURL?: string;
  fileName?: string;
}): Promise<MistralFileUploadResponse> {
  const form = new FormData();
  form.append('purpose', 'ocr');
  const actualFileName = fileName || path.basename(filePath);
  const fileStream = fs.createReadStream(filePath);
  form.append('file', fileStream, { filename: actualFileName });

  return axios
    .post(`${baseURL}/files`, form, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...form.getHeaders(),
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    })
    .then((res) => res.data)
    .catch((error) => {
      throw error;
    });
}

export async function getSignedUrl({
  apiKey,
  fileId,
  expiry = 24,
  baseURL = DEFAULT_MISTRAL_BASE_URL,
}: {
  apiKey: string;
  fileId: string;
  expiry?: number;
  baseURL?: string;
}): Promise<MistralSignedUrlResponse> {
  return axios
    .get(`${baseURL}/files/${fileId}/url?expiry=${expiry}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })
    .then((res) => res.data)
    .catch((error) => {
      logger.error('Error fetching signed URL:', error.message);
      throw error;
    });
}

/**
 * @param {Object} params
 * @param {string} params.apiKey
 * @param {string} params.url - The document or image URL
 * @param {string} [params.documentType='document_url'] - 'document_url' or 'image_url'
 * @param {string} [params.model]
 * @param {string} [params.baseURL]
 * @returns {Promise<OCRResult>}
 */
export async function performOCR({
  url,
  apiKey,
  model = DEFAULT_MISTRAL_MODEL,
  baseURL = DEFAULT_MISTRAL_BASE_URL,
  documentType = 'document_url',
}: {
  url: string;
  apiKey: string;
  model?: string;
  baseURL?: string;
  documentType?: 'document_url' | 'image_url';
}): Promise<OCRResult> {
  const documentKey = documentType === 'image_url' ? 'image_url' : 'document_url';
  return axios
    .post(
      `${baseURL}/ocr`,
      {
        model,
        image_limit: 0,
        include_image_base64: false,
        document: {
          type: documentType,
          [documentKey]: url,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      },
    )
    .then((res) => res.data)
    .catch((error) => {
      logger.error('Error performing OCR:', error.message);
      throw error;
    });
}

/**
 * Determines if a value needs to be loaded from environment
 */
function needsEnvLoad(value: string): boolean {
  return envVarRegex.test(value) || !value.trim();
}

/**
 * Gets the environment variable name for a config value
 */
function getEnvVarName(configValue: string, defaultName: string): string {
  if (!envVarRegex.test(configValue)) {
    return defaultName;
  }
  return extractVariableName(configValue) || defaultName;
}

/**
 * Resolves a configuration value from either hardcoded or environment
 */
async function resolveConfigValue(
  configValue: string,
  defaultEnvName: string,
  authValues: Record<string, string | undefined>,
  defaultValue?: string,
): Promise<string> {
  // If it's a hardcoded value (not env var and not empty), use it directly
  if (!needsEnvLoad(configValue)) {
    return configValue;
  }

  // Otherwise, get from auth values
  const envVarName = getEnvVarName(configValue, defaultEnvName);
  return authValues[envVarName] || defaultValue || '';
}

/**
 * Loads authentication configuration from OCR config
 */
async function loadAuthConfig(context: OCRContext): Promise<AuthConfig> {
  const ocrConfig = context.req.app.locals?.ocr;
  const apiKeyConfig = ocrConfig?.apiKey || '';
  const baseURLConfig = ocrConfig?.baseURL || '';

  if (!needsEnvLoad(apiKeyConfig) && !needsEnvLoad(baseURLConfig)) {
    return {
      apiKey: apiKeyConfig,
      baseURL: baseURLConfig,
    };
  }

  const authFields: string[] = [];

  if (needsEnvLoad(baseURLConfig)) {
    authFields.push(getEnvVarName(baseURLConfig, 'OCR_BASEURL'));
  }

  if (needsEnvLoad(apiKeyConfig)) {
    authFields.push(getEnvVarName(apiKeyConfig, 'OCR_API_KEY'));
  }

  const authValues = await context.loadAuthValues({
    userId: context.req.user?.id || '',
    authFields,
    optional: new Set(['OCR_BASEURL']),
  });

  const apiKey = await resolveConfigValue(apiKeyConfig, 'OCR_API_KEY', authValues);
  const baseURL = await resolveConfigValue(
    baseURLConfig,
    'OCR_BASEURL',
    authValues,
    DEFAULT_MISTRAL_BASE_URL,
  );

  return { apiKey, baseURL };
}

/**
 * Gets the model configuration
 */
function getModelConfig(ocrConfig: TCustomConfig['ocr']): string {
  const modelConfig = ocrConfig?.mistralModel || '';

  if (!modelConfig.trim()) {
    return DEFAULT_MISTRAL_MODEL;
  }

  if (envVarRegex.test(modelConfig)) {
    return extractEnvVariable(modelConfig) || DEFAULT_MISTRAL_MODEL;
  }

  return modelConfig.trim();
}

/**
 * Determines document type based on file
 */
function getDocumentType(file: Express.Multer.File): 'image_url' | 'document_url' {
  const mimetype = (file.mimetype || '').toLowerCase();
  const originalname = file.originalname || '';
  const isImage =
    mimetype.startsWith('image') || /\.(png|jpe?g|gif|bmp|webp|tiff?)$/i.test(originalname);

  return isImage ? 'image_url' : 'document_url';
}

/**
 * Processes OCR result pages into aggregated text and images
 */
function processOCRResult(ocrResult: OCRResult): { text: string; images: string[] } {
  let aggregatedText = '';
  const images: string[] = [];

  ocrResult.pages.forEach((page: OCRResultPage, index: number) => {
    if (ocrResult.pages.length > 1) {
      aggregatedText += `# PAGE ${index + 1}\n`;
    }

    aggregatedText += page.markdown + '\n\n';

    if (!page.images || page.images.length === 0) {
      return;
    }

    page.images.forEach((image: OCRImage) => {
      if (image.image_base64) {
        images.push(image.image_base64);
      }
    });
  });

  return { text: aggregatedText, images };
}

/**
 * Creates an error message for OCR operations
 */
function createOCRError(error: unknown, baseMessage: string): Error {
  const axiosError = error as AxiosError<MistralOCRError>;
  const detail = axiosError?.response?.data?.detail;
  const message = detail || baseMessage;

  const responseMessage = axiosError?.response?.data?.message;
  const errorLog = logAxiosError({ error: axiosError, message });
  const fullMessage = responseMessage ? `${errorLog} - ${responseMessage}` : errorLog;

  return new Error(fullMessage);
}

/**
 * Uploads a file to the Mistral OCR API and processes the OCR result.
 *
 * @param params - The params object.
 * @param params.req - The request object from Express. It should have a `user` property with an `id`
 *                       representing the user
 * @param params.file - The file object, which is part of the request. The file object should
 *                                     have a `mimetype` property that tells us the file type
 * @param params.loadAuthValues - Function to load authentication values
 * @returns - The result object containing the processed `text` and `images` (not currently used),
 *                       along with the `filename` and `bytes` properties.
 */
export const uploadMistralOCR = async (context: OCRContext): Promise<MistralOCRUploadResult> => {
  try {
    const { apiKey, baseURL } = await loadAuthConfig(context);
    const model = getModelConfig(context.req.app.locals?.ocr);

    const mistralFile = await uploadDocumentToMistral({
      filePath: context.file.path,
      fileName: context.file.originalname,
      apiKey,
      baseURL,
    });

    const signedUrlResponse = await getSignedUrl({
      apiKey,
      baseURL,
      fileId: mistralFile.id,
    });

    const documentType = getDocumentType(context.file);
    const ocrResult = await performOCR({
      apiKey,
      baseURL,
      model,
      url: signedUrlResponse.url,
      documentType,
    });

    // Process result
    const { text, images } = processOCRResult(ocrResult);

    return {
      filename: context.file.originalname,
      bytes: text.length * 4,
      filepath: FileSources.mistral_ocr,
      text,
      images,
    };
  } catch (error) {
    throw createOCRError(error, 'Error uploading document to Mistral OCR API');
  }
};

/**
 * Use Azure Mistral OCR API to processe the OCR result.
 *
 * @param params - The params object.
 * @param params.req - The request object from Express. It should have a `user` property with an `id`
 *                       representing the user
 * @param params.file - The file object, which is part of the request. The file object should
 *                                     have a `mimetype` property that tells us the file type
 * @param params.loadAuthValues - Function to load authentication values
 * @returns - The result object containing the processed `text` and `images` (not currently used),
 *                       along with the `filename` and `bytes` properties.
 */
export const uploadAzureMistralOCR = async (
  context: OCRContext,
): Promise<MistralOCRUploadResult> => {
  try {
    const { apiKey, baseURL } = await loadAuthConfig(context);
    const model = getModelConfig(context.req.app.locals?.ocr);

    const buffer = fs.readFileSync(context.file.path);
    const base64 = buffer.toString('base64');
    /** Uses actual mimetype of the file, 'image/jpeg' as fallback since it seems to be accepted regardless of mismatch */
    const base64Prefix = `data:${context.file.mimetype || 'image/jpeg'};base64,`;

    const documentType = getDocumentType(context.file);
    const ocrResult = await performOCR({
      apiKey,
      baseURL,
      model,
      url: `${base64Prefix}${base64}`,
      documentType,
    });

    const { text, images } = processOCRResult(ocrResult);

    return {
      filename: context.file.originalname,
      bytes: text.length * 4,
      filepath: FileSources.azure_mistral_ocr,
      text,
      images,
    };
  } catch (error) {
    throw createOCRError(error, 'Error uploading document to Azure Mistral OCR API');
  }
};
