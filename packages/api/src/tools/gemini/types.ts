import type { ServerRequest } from '../../types';

/** MongoDB file interface for image files */
export interface MongoFile {
  file_id: string;
  filepath: string;
  source?: string;
  type?: string;
  height?: number;
  width?: number;
}

/** Gemini API safety rating */
export interface SafetyRating {
  category: string;
  probability: string;
  blocked?: boolean;
}

/** Gemini API response candidate */
export interface GeminiCandidate {
  finishReason?: string;
  content?: {
    parts?: Array<{
      text?: string;
      inlineData?: {
        mimeType: string;
        data: string;
      };
    }>;
  };
  safetyRatings?: SafetyRating[];
}

/** Gemini API response */
export interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

/** Safety block information */
export interface SafetyBlock {
  reason: string;
  message: string;
  safetyRatings?: SafetyRating[];
  category?: string;
  probability?: string;
}

/** Inline data format for Gemini API */
export interface GeminiInlineData {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

/** Content part for Gemini API request */
export type GeminiContentPart = { text: string } | GeminiInlineData;

/** Function type for fetching files from database */
export type GetFilesFunction = (
  query: Record<string, unknown>,
  projection?: Record<string, unknown>,
  options?: Record<string, unknown>,
) => Promise<MongoFile[]>;

/** Function type for getting download stream */
export type GetDownloadStreamFunction = (
  req: ServerRequest,
  filepath: string,
) => Promise<NodeJS.ReadableStream>;

/** Function type for getting strategy functions */
export type GetStrategyFunctionsType = (source: string) => {
  getDownloadStream: GetDownloadStreamFunction;
};

/** Constructor fields for GeminiImageGen */
export interface GeminiImageGenFields {
  override?: boolean;
  returnMetadata?: boolean;
  userId?: string;
  fileStrategy?: string;
  isAgent?: boolean;
  req?: ServerRequest;
  processFileURL?: (params: ProcessFileURLParams) => Promise<{ filepath: string }>;
  imageFiles?: MongoFile[];
  /** Function to fetch files from database */
  getFiles?: GetFilesFunction;
  /** Function to get file strategy functions (download streams) */
  getStrategyFunctions?: GetStrategyFunctionsType;
}

/** Parameters for processFileURL function */
export interface ProcessFileURLParams {
  URL: string;
  basePath: string;
  userId: string;
  fileName: string;
  fileStrategy: string;
  context: string;
}

/** Parameters for saving base64 image to storage */
export interface SaveBase64ImageParams {
  base64Data: string;
  outputFormat: string;
  processFileURL?: (params: ProcessFileURLParams) => Promise<{ filepath: string }>;
  fileStrategy?: string;
  userId?: string;
}

/** Image generation result content */
export interface ImageResultContent {
  type: string;
  image_url: {
    url: string;
  };
}

/** Text response content */
export interface TextResponseContent {
  type: string;
  text: string;
}

/** Artifact result */
export interface ArtifactResult {
  content: ImageResultContent[];
  file_ids: string[];
}

/** Tool return type for agent mode */
export type AgentToolReturn = [TextResponseContent[], ArtifactResult];

/** Provider type */
export type GeminiProvider = 'gemini' | 'vertex';
