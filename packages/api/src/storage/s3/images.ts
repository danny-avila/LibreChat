import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { logger } from '@librechat/data-schemas';
import { saveBufferToS3 } from './crud';
import { s3Config } from './s3Config';
import type { FormatEnum } from 'sharp';
import type {
  UploadImageParams,
  ImageUploadResult,
  ProcessAvatarParams,
  MongoFile,
} from '../types';

const { DEFAULT_BASE_PATH: defaultBasePath } = s3Config;

export interface S3ImageServiceDeps {
  resizeImageBuffer: (
    buffer: Buffer,
    resolution: string,
    endpoint: string,
  ) => Promise<{ buffer: Buffer; width: number; height: number }>;
  updateUser: (userId: string, update: { avatar: string }) => Promise<void>;
  updateFile: (params: { file_id: string }) => Promise<MongoFile>;
}

export class S3ImageService {
  private deps: S3ImageServiceDeps;

  constructor(deps: S3ImageServiceDeps) {
    this.deps = deps;
  }

  async uploadImageToS3({
    req,
    file,
    file_id,
    endpoint,
    resolution = 'high',
    basePath = defaultBasePath,
  }: UploadImageParams): Promise<ImageUploadResult> {
    if (!req.user) {
      throw new Error('[S3ImageService.uploadImageToS3] User not authenticated');
    }

    try {
      const appConfig = req.config;
      const inputFilePath = file.path;
      const inputBuffer = await fs.promises.readFile(inputFilePath);

      const {
        buffer: resizedBuffer,
        width,
        height,
      } = await this.deps.resizeImageBuffer(inputBuffer, resolution, endpoint);

      const extension = path.extname(inputFilePath);
      const userId = req.user.id;

      let processedBuffer: Buffer;
      let fileName = `${file_id}__${path.basename(inputFilePath)}`;
      const targetExtension = `.${appConfig?.imageOutputType ?? 'webp'}`;

      if (extension.toLowerCase() === targetExtension) {
        processedBuffer = resizedBuffer;
      } else {
        const outputFormat = (appConfig?.imageOutputType ?? 'webp') as keyof FormatEnum;
        processedBuffer = await sharp(resizedBuffer).toFormat(outputFormat).toBuffer();
        fileName = fileName.replace(new RegExp(path.extname(fileName) + '$'), targetExtension);
        if (!path.extname(fileName)) {
          fileName += targetExtension;
        }
      }

      const downloadURL = await saveBufferToS3({
        userId,
        buffer: processedBuffer,
        fileName,
        basePath,
      });

      await fs.promises.unlink(inputFilePath);
      const bytes = Buffer.byteLength(processedBuffer);

      return { filepath: downloadURL, bytes, width, height };
    } catch (error) {
      logger.error(
        '[S3ImageService.uploadImageToS3] Error uploading image to S3:',
        (error as Error).message,
      );
      throw error;
    }
  }

  async prepareImageURL(file: { file_id: string; filepath: string }): Promise<[MongoFile, string]> {
    try {
      return await Promise.all([this.deps.updateFile({ file_id: file.file_id }), file.filepath]);
    } catch (error) {
      logger.error(
        '[S3ImageService.prepareImageURL] Error preparing image URL:',
        (error as Error).message,
      );
      throw error;
    }
  }

  async processAvatar({
    buffer,
    userId,
    manual,
    agentId,
    basePath = defaultBasePath,
  }: ProcessAvatarParams): Promise<string> {
    try {
      const metadata = await sharp(buffer).metadata();
      const extension = metadata.format === 'gif' ? 'gif' : 'png';
      const timestamp = new Date().getTime();

      const fileName = agentId
        ? `agent-${agentId}-avatar-${timestamp}.${extension}`
        : `avatar-${timestamp}.${extension}`;

      const downloadURL = await saveBufferToS3({ userId, buffer, fileName, basePath });

      if (manual === 'true' && !agentId) {
        await this.deps.updateUser(userId, { avatar: downloadURL });
      }

      return downloadURL;
    } catch (error) {
      logger.error(
        '[S3ImageService.processAvatar] Error processing S3 avatar:',
        (error as Error).message,
      );
      throw error;
    }
  }
}
