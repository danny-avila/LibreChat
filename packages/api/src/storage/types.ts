import type { TFile } from 'librechat-data-provider';
import type { ServerRequest } from '~/types';

export interface SaveBufferParams {
  userId: string;
  buffer: Buffer;
  fileName: string;
  basePath?: string;
}

export interface GetURLParams {
  userId: string;
  fileName: string;
  basePath?: string;
  customFilename?: string | null;
  contentType?: string | null;
}

export interface SaveURLParams {
  userId: string;
  URL: string;
  fileName: string;
  basePath?: string;
}

export interface UploadFileParams {
  req: ServerRequest;
  file: Express.Multer.File;
  file_id: string;
  basePath?: string;
}

export interface UploadImageParams extends UploadFileParams {
  endpoint: string;
  resolution?: string;
}

export interface UploadResult {
  filepath: string;
  bytes: number;
}

export interface ImageUploadResult extends UploadResult {
  width: number;
  height: number;
}

export interface ProcessAvatarParams {
  buffer: Buffer;
  userId: string;
  manual: string;
  agentId?: string;
  basePath?: string;
}

export interface S3FileRef {
  filepath: string;
  source: string;
}

export type SaveBufferFn = (params: SaveBufferParams) => Promise<string>;

export type BatchUpdateFn = (files: Array<{ file_id: string; filepath: string }>) => Promise<void>;

export type UrlBuilder = (params: GetURLParams) => Promise<string>;

export type MongoFile = TFile;
