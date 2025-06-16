import { EImageOutputType } from 'librechat-data-provider';
import sharp from 'sharp';

export interface ResizeAvatarParams {
  userId: string;
  input: string | Buffer | File;
  desiredFormat?: typeof EImageOutputType;
}

export interface ResizeAndConvertOptions {
  inputBuffer: Buffer;
  desiredFormat: keyof sharp.FormatEnum | typeof EImageOutputType;
  width?: number;
}

export interface ProcessAvatarParams {
  buffer: Buffer;
  userId: string;
  manual?: string | boolean;
  basePath?: string;
  containerName?: string;
}
