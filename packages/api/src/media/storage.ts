import sharp from 'sharp';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, stat, unlink } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import type { MediaAssetContent, MediaMethods, MediaOwnerScope } from '@librechat/data-schemas';
import type { MediaAsset, MediaConfig } from 'librechat-data-provider';
import type { Readable, TransformCallback } from 'node:stream';
import { MediaServiceError } from './errors';

export interface MediaStorage {
  publish(input: {
    scope: MediaOwnerScope;
    outputKey: string;
    stream: Readable;
    type: string;
    filename: string;
    config: MediaConfig;
    expiredAt?: string | null;
    hardExpiresAt?: string | null;
  }): Promise<MediaAsset>;
  read(
    scope: MediaOwnerScope,
    fileId: string,
    maxBytes: number,
  ): Promise<{ asset: MediaAsset; data: Buffer }>;
  remove(scope: MediaOwnerScope, fileId: string): Promise<boolean>;
  discardWrite(scope: MediaOwnerScope, writeId: string, staleBefore: string): Promise<boolean>;
  capture(scope: MediaOwnerScope, fileId: string, config: MediaConfig): Promise<MediaAsset>;
}

class MediaByteCounter extends Transform {
  bytes = 0;
  readonly hash = createHash('sha256');
  constructor(private readonly maxBytes: number) {
    super();
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.bytes += chunk.length;
    if (this.bytes > this.maxBytes) {
      callback(
        new MediaServiceError('invalid_request', 413, 'Media exceeds the configured file limit.'),
      );
      return;
    }
    this.hash.update(chunk);
    callback(null, chunk);
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

export function createLocalMediaStorage({
  repository,
  imageDirectory,
  uploadDirectory,
}: {
  repository: MediaMethods;
  imageDirectory: string;
  uploadDirectory: string;
}): MediaStorage {
  const root = path.resolve(imageDirectory);
  function originalPath(
    content: Pick<MediaAssetContent, 'storageKey' | 'filepath' | 'source'>,
  ): string {
    if (content.source !== 'local') {
      throw new MediaServiceError(
        'unsupported',
        422,
        'This storage source requires a media storage adapter.',
      );
    }
    const key = content.storageKey ?? content.filepath.replace(/^\//, '');
    const prefix = ['images/', 'uploads/'].find((candidate) => key.startsWith(candidate));
    if (!prefix) {
      throw new MediaServiceError('not_found', 404, 'Media content is unavailable.');
    }
    const directory = prefix === 'images/' ? root : path.resolve(uploadDirectory);
    const resolved = path.resolve(directory, key.slice(prefix.length));
    const relative = path.relative(directory, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new MediaServiceError('not_found', 404, 'Media content is unavailable.');
    }
    return resolved;
  }

  const storage: MediaStorage = {
    async publish(input) {
      if (!/^[A-Za-z0-9_-]+$/.test(input.scope.ownerId)) {
        throw new MediaServiceError('invalid_request', 400, 'Invalid media owner.');
      }
      const video = input.type.startsWith('video/');
      const extensions: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
      };
      const extension = extensions[input.type];
      if (!extension) {
        throw new MediaServiceError('unsupported', 422, 'Unsupported media content type.');
      }
      const ingestToken = randomUUID();
      const key = `images/${input.scope.ownerId}/${ingestToken}.${extension}`;
      const receipt = await repository.reserveMediaAssetWrite({
        scope: input.scope,
        outputKey: input.outputKey,
        rendition: 'original',
        ingestToken,
        fingerprint: createHash('sha256').update(input.outputKey).digest('hex'),
        storageKey: key,
      });
      const location = originalPath({ source: 'local', storageKey: key, filepath: `/${key}` });
      await mkdir(path.dirname(location), { recursive: true });
      const counter = new MediaByteCounter(
        video ? input.config.transfers.maxVideoBytes : input.config.transfers.maxImageBytes,
      );
      let publicationAttempted = false;
      try {
        await pipeline(
          input.stream,
          counter,
          createWriteStream(location, { flags: 'wx', mode: 0o600 }),
        );
        let width: number | undefined;
        let height: number | undefined;
        let type = input.type;
        if (!video) {
          const metadata = await sharp(location).metadata();
          const mime = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
          if (!metadata.format || !(metadata.format in mime)) {
            throw new MediaServiceError('unsupported', 422, 'Only raster images are supported.');
          }
          type = mime[metadata.format as keyof typeof mime];
          width = metadata.width;
          height = metadata.height;
          if (type !== input.type) {
            throw new MediaServiceError(
              'invalid_request',
              422,
              'Image content does not match its media type.',
            );
          }
        } else {
          const file = await open(location, 'r');
          const header = Buffer.alloc(12);
          try {
            await file.read(header, 0, header.length, 0);
          } finally {
            await file.close();
          }
          const valid =
            type === 'video/mp4'
              ? header.toString('ascii', 4, 8) === 'ftyp'
              : type === 'video/webm' && header.readUInt32BE(0) === 0x1a45dfa3;
          if (!valid) {
            throw new MediaServiceError('unsupported', 422, 'Unsupported video content.');
          }
        }
        publicationAttempted = true;
        const asset = await repository.commitMediaAssetWrite({
          scope: input.scope,
          writeId: receipt.writeId,
          content: {
            file_id: receipt.fileId,
            filename: path.basename(input.filename),
            type,
            bytes: counter.bytes,
            filepath: `/${key}`,
            source: 'local',
            storageKey: key,
            contentDigest: counter.hash.digest('hex'),
            width,
            height,
            expiredAt: input.expiredAt,
            hardExpiresAt: input.hardExpiresAt,
          },
        });
        if (asset.filepath !== `/${key}`) {
          await unlink(location).catch(() => undefined);
        }
        return asset;
      } catch (error) {
        if (!publicationAttempted) {
          await unlink(location).catch(() => undefined);
        }
        await storage
          .discardWrite(input.scope, receipt.writeId, new Date().toISOString())
          .catch(() => undefined);
        throw error;
      }
    },
    async read(scope, fileId, maxBytes) {
      const content = await repository.getMediaAssetContent(scope, fileId);
      if (!content) {
        throw new MediaServiceError('not_found', 404, 'Media input is unavailable.');
      }
      if (content.bytes > maxBytes) {
        throw new MediaServiceError('invalid_request', 413, 'Media input is too large.');
      }
      const chunks: Buffer[] = [];
      const hash = createHash('sha256');
      let bytes = 0;
      for await (const chunk of createReadStream(originalPath(content))) {
        const buffer = Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > maxBytes) {
          throw new MediaServiceError('invalid_request', 413, 'Media input is too large.');
        }
        hash.update(buffer);
        chunks.push(buffer);
      }
      const data = Buffer.concat(chunks);
      if (hash.digest('hex') !== content.contentDigest) {
        throw new MediaServiceError('storage_failed', 409, 'The media original changed.');
      }
      const {
        source: _source,
        storageKey: _key,
        storageRegion: _region,
        contentDigest: _digest,
        expiredAt: _expiry,
        hardExpiresAt: _hardExpiry,
        ...asset
      } = content;
      return { asset, data };
    },
    async discardWrite(scope, writeId, staleBefore) {
      const token = randomUUID();
      const write = await repository.claimMediaAssetWriteDeletion({
        scope,
        writeId,
        token,
        staleBefore,
      });
      if (!write) return false;
      try {
        await unlink(
          originalPath({
            source: 'local',
            storageKey: write.storageKey,
            filepath: `/${write.storageKey}`,
          }),
        );
      } catch (error) {
        if (!isMissingFile(error)) throw error;
      }
      return repository.completeMediaAssetWriteDeletion({ scope, writeId, token });
    },
    async remove(scope, fileId) {
      const token = randomUUID();
      const content = await repository.claimMediaAssetDeletion({ scope, fileId, token });
      if (!content) {
        return false;
      }
      try {
        await unlink(originalPath(content));
      } catch (error) {
        if (!isMissingFile(error)) {
          throw error;
        }
      }
      return repository.completeMediaAssetDeletion({ scope, fileId, token });
    },
    async capture(scope, fileId, config) {
      const existing = await repository.getMediaAsset(scope, fileId);
      if (existing) {
        return existing;
      }
      const source = await repository.getMediaSourceFile(scope, fileId);
      if (!source) {
        throw new MediaServiceError('not_found', 404, 'The source file is unavailable.');
      }
      const location = originalPath(source);
      const before = await stat(location);
      const captured = await storage.publish({
        scope,
        outputKey: `capture:${fileId}:${source.sourceRevision}`,
        stream: createReadStream(location),
        type: source.type,
        filename: source.filename,
        config,
        expiredAt:
          source.expiredAt ?? new Date(Date.now() + config.assets.orphanRetentionMs).toISOString(),
        hardExpiresAt: source.hardExpiresAt ?? source.expiredAt,
      });
      const [after, current] = await Promise.all([
        stat(location),
        repository.getMediaSourceFile(scope, fileId),
      ]);
      if (
        !current ||
        current.sourceRevision !== source.sourceRevision ||
        before.ino !== after.ino ||
        before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs
      ) {
        throw new MediaServiceError(
          'version_conflict',
          409,
          'The source changed while it was imported.',
        );
      }
      return captured;
    },
  };
  return storage;
}
