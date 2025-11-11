import type { IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest } from './http';
import type { Readable } from 'stream';
export interface STTService {
  getInstance(): Promise<STTService>;
  getProviderSchema(req: ServerRequest): Promise<[string, object]>;
  sttRequest(
    provider: string,
    schema: object,
    params: { audioBuffer: Buffer; audioFile: AudioFileInfo },
  ): Promise<string>;
}

export interface AudioFileInfo {
  originalname: string;
  mimetype: string;
  size: number;
}

export interface FileObject {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface AudioProcessingResult {
  text: string;
  bytes: number;
}

export interface VideoResult {
  videos: Array<{
    type: string;
    mimeType: string;
    data: string;
  }>;
  files: Array<{
    file_id?: string;
    temp_file_id?: string;
    filepath: string;
    source?: string;
    filename: string;
    type: string;
  }>;
}

/** Anthropic document block format */
export interface AnthropicDocumentBlock {
  type: 'document';
  source: {
    type: string;
    media_type: string;
    data: string;
  };
  context?: string;
  title?: string;
  cache_control?: { type: string };
  citations?: { enabled: boolean };
}

/** Google document block format */
export interface GoogleDocumentBlock {
  type: 'document';
  mimeType: string;
  data: string;
}

/** OpenAI file block format */
export interface OpenAIFileBlock {
  type: 'file';
  file: {
    filename: string;
    file_data: string;
  };
}

/** OpenAI Responses API file format */
export interface OpenAIInputFileBlock {
  type: 'input_file';
  filename: string;
  file_data: string;
}

export type DocumentBlock =
  | AnthropicDocumentBlock
  | GoogleDocumentBlock
  | OpenAIFileBlock
  | OpenAIInputFileBlock;

export interface DocumentResult {
  documents: DocumentBlock[];
  files: Array<{
    file_id?: string;
    temp_file_id?: string;
    filepath: string;
    source?: string;
    filename: string;
    type: string;
  }>;
}

export interface AudioResult {
  audios: Array<{
    type: string;
    mimeType: string;
    data: string;
  }>;
  files: Array<{
    file_id?: string;
    temp_file_id?: string;
    filepath: string;
    source?: string;
    filename: string;
    type: string;
  }>;
}

export interface ProcessedFile {
  file: IMongoFile;
  content: string;
  metadata: {
    file_id: string;
    temp_file_id?: string;
    filepath: string;
    source?: string;
    filename: string;
    type: string;
  };
}

export interface StrategyFunctions {
  getDownloadStream: (req: ServerRequest, filepath: string) => Promise<Readable>;
}
