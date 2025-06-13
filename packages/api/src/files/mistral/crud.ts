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
  OCRResult,
  OCRResultPage,
  OCRImage,
  MistralFileUploadResponse,
  MistralSignedUrlResponse,
  MistralOCRUploadResult,
  MistralOCRError,
} from '~/types';
// import { loadAuthValues } from '~/server/services/Tools/credentials';
import { logAxiosError, createAxiosInstance } from '~/utils/axios';

const axios = createAxiosInstance();

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
  baseURL = 'https://api.mistral.ai/v1',
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
  baseURL = 'https://api.mistral.ai/v1',
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
  model = 'mistral-ocr-latest',
  baseURL = 'https://api.mistral.ai/v1',
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
export const uploadMistralOCR = async ({
  req,
  file,
  loadAuthValues,
}: {
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
}): Promise<MistralOCRUploadResult> => {
  try {
    const ocrConfig: TCustomConfig['ocr'] = req.app.locals?.ocr;

    const apiKeyConfig = ocrConfig?.apiKey || '';
    const baseURLConfig = ocrConfig?.baseURL || '';

    const isApiKeyEnvVar = envVarRegex.test(apiKeyConfig);
    const isBaseURLEnvVar = envVarRegex.test(baseURLConfig);

    const isApiKeyEmpty = !apiKeyConfig.trim();
    const isBaseURLEmpty = !baseURLConfig.trim();

    let apiKey, baseURL;

    if (isApiKeyEnvVar || isBaseURLEnvVar || isApiKeyEmpty || isBaseURLEmpty) {
      const apiKeyVarName = isApiKeyEnvVar
        ? extractVariableName(apiKeyConfig) || 'OCR_API_KEY'
        : 'OCR_API_KEY';
      const baseURLVarName = isBaseURLEnvVar
        ? extractVariableName(baseURLConfig) || 'OCR_BASEURL'
        : 'OCR_BASEURL';

      const authValues = await loadAuthValues({
        userId: req.user?.id || '',
        authFields: [baseURLVarName, apiKeyVarName],
        optional: new Set([baseURLVarName]),
      });

      apiKey = authValues[apiKeyVarName] || '';
      baseURL = authValues[baseURLVarName] || 'https://api.mistral.ai/v1';
    } else {
      apiKey = apiKeyConfig;
      baseURL = baseURLConfig;
    }

    const mistralFile = await uploadDocumentToMistral({
      filePath: file.path,
      fileName: file.originalname,
      apiKey,
      baseURL,
    });

    const modelConfig = ocrConfig?.mistralModel || '';
    const model = envVarRegex.test(modelConfig)
      ? extractEnvVariable(modelConfig)
      : modelConfig.trim() || 'mistral-ocr-latest';

    const signedUrlResponse = await getSignedUrl({
      apiKey,
      baseURL,
      fileId: mistralFile.id,
    });

    const mimetype = (file.mimetype || '').toLowerCase();
    const originalname = file.originalname || '';
    const isImage =
      mimetype.startsWith('image') || /\.(png|jpe?g|gif|bmp|webp|tiff?)$/i.test(originalname);
    const documentType = isImage ? 'image_url' : 'document_url';

    const ocrResult = await performOCR({
      apiKey,
      baseURL,
      model,
      url: signedUrlResponse.url,
      documentType,
    });

    let aggregatedText = '';
    const images: string[] = [];
    ocrResult.pages.forEach((page: OCRResultPage, index: number) => {
      if (ocrResult.pages.length > 1) {
        aggregatedText += `# PAGE ${index + 1}\n`;
      }

      aggregatedText += page.markdown + '\n\n';

      if (page.images && page.images.length > 0) {
        page.images.forEach((image: OCRImage) => {
          if (image.image_base64) {
            images.push(image.image_base64);
          }
        });
      }
    });

    return {
      filename: file.originalname,
      bytes: aggregatedText.length * 4,
      filepath: FileSources.mistral_ocr,
      text: aggregatedText,
      images,
    };
  } catch (error: unknown) {
    let message = 'Error uploading document to Mistral OCR API';
    const axiosError = error as AxiosError<MistralOCRError>;
    const detail = axiosError?.response?.data?.detail;
    if (detail && detail !== '') {
      message = detail;
    }

    const responseMessage = axiosError?.response?.data?.message;
    throw new Error(
      `${logAxiosError({ error: axiosError, message })}${responseMessage && responseMessage !== '' ? ` - ${responseMessage}` : ''}`,
    );
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
export const uploadAzureMistralOCR = async ({
  req,
  file,
  loadAuthValues,
}: {
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
}): Promise<MistralOCRUploadResult> => {
  try {
    const ocrConfig: TCustomConfig['ocr'] = req.app.locals?.ocr;

    const apiKeyConfig = ocrConfig?.apiKey || '';
    const baseURLConfig = ocrConfig?.baseURL || '';

    const isApiKeyEnvVar = envVarRegex.test(apiKeyConfig);
    const isBaseURLEnvVar = envVarRegex.test(baseURLConfig);

    const isApiKeyEmpty = !apiKeyConfig.trim();
    const isBaseURLEmpty = !baseURLConfig.trim();

    let apiKey, baseURL;

    if (isApiKeyEnvVar || isBaseURLEnvVar || isApiKeyEmpty || isBaseURLEmpty) {
      const apiKeyVarName = isApiKeyEnvVar
        ? extractVariableName(apiKeyConfig) || 'OCR_API_KEY'
        : 'OCR_API_KEY';
      const baseURLVarName = isBaseURLEnvVar
        ? extractVariableName(baseURLConfig) || 'OCR_BASEURL'
        : 'OCR_BASEURL';

      const authValues = await loadAuthValues({
        userId: req.user?.id || '',
        authFields: [baseURLVarName, apiKeyVarName],
        optional: new Set([baseURLVarName]),
      });

      apiKey = authValues[apiKeyVarName] || '';
      baseURL = authValues[baseURLVarName] || 'https://api.mistral.ai/v1';
    } else {
      apiKey = apiKeyConfig;
      baseURL = baseURLConfig;
    }

    const modelConfig = ocrConfig?.mistralModel || '';
    const model = envVarRegex.test(modelConfig)
      ? extractEnvVariable(modelConfig)
      : modelConfig.trim() || 'mistral-ocr-latest';

    const mimetype = (file.mimetype || '').toLowerCase();
    const originalname = file.originalname || '';
    const isImage =
      mimetype.startsWith('image') || /\.(png|jpe?g|gif|bmp|webp|tiff?)$/i.test(originalname);
    const documentType = isImage ? 'image_url' : 'document_url';

    const buffer = fs.readFileSync(file.path);
    const base64 = buffer.toString('base64');
    const ocrResult = await performOCR({
      apiKey,
      baseURL,
      model,
      url: `data:image/jpeg;base64,${base64}`,
      documentType,
    });

    let aggregatedText = '';
    const images: string[] = [];
    ocrResult.pages.forEach((page: OCRResultPage, index: number) => {
      if (ocrResult.pages.length > 1) {
        aggregatedText += `# PAGE ${index + 1}\n`;
      }

      aggregatedText += page.markdown + '\n\n';

      if (page.images && page.images.length > 0) {
        page.images.forEach((image: OCRImage) => {
          if (image.image_base64) {
            images.push(image.image_base64);
          }
        });
      }
    });

    return {
      filename: file.originalname,
      bytes: aggregatedText.length * 4,
      filepath: FileSources.azure_mistral_ocr,
      text: aggregatedText,
      images,
    };
  } catch (error) {
    const message = 'Error uploading document to Azure Mistral OCR API';
    const axiosError = error as AxiosError;
    throw new Error(logAxiosError({ error: axiosError, message }));
  }
};
