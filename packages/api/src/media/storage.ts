import sharp from 'sharp';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, stat, unlink, readFile } from 'node:fs/promises';
import type { MediaAssetContent, MediaMethods, MediaOwnerScope } from '@librechat/data-schemas';
import type { MediaAsset, MediaConfig } from 'librechat-data-provider';
import type { Readable, TransformCallback } from 'node:stream';
import type { Hash } from 'node:crypto';
import {
  mediaContentByteLimit,
  mediaContentExtension,
  normalizeMediaContentType,
  validateMediaAudio,
  validateMediaSvg,
} from './content';
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
  ): Promise<{ asset: MediaAsset; data: Buffer; digest: string }>;
  remove(scope: MediaOwnerScope, fileId: string): Promise<boolean>;
  discardWrite(scope: MediaOwnerScope, writeId: string, staleBefore: string): Promise<boolean>;
  capture(scope: MediaOwnerScope, fileId: string, config: MediaConfig): Promise<MediaAsset>;
}

export class MediaByteCounter extends Transform {
  bytes: number = 0;
  readonly hash: Hash = createHash('sha256');
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

async function readHeader(location: string): Promise<Buffer> {
  const file = await open(location, 'r');
  const header = Buffer.alloc(12);
  try {
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    return header.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

function matchesRasterHeader(header: Buffer, type: string): boolean {
  if (type === 'image/png')
    return header.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (type === 'image/jpeg') return header.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
  return (
    type === 'image/webp' &&
    header.toString('ascii', 0, 4) === 'RIFF' &&
    header.toString('ascii', 8, 12) === 'WEBP'
  );
}

export function createLocalMediaStorage({
  repository,
  imageDirectory,
  uploadDirectory,
  now,
}: {
  repository: MediaMethods;
  imageDirectory: string;
  uploadDirectory: string;
  now: () => number;
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
      const contentType = normalizeMediaContentType(input.type);
      const video = contentType.startsWith('video/');
      const audio = contentType.startsWith('audio/');
      const extension = mediaContentExtension(contentType);
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
      const counter = new MediaByteCounter(mediaContentByteLimit(input.type, input.config));
      let publicationAttempted = false;
      try {
        await pipeline(
          input.stream,
          counter,
          createWriteStream(location, { flags: 'wx', mode: 0o600 }),
        );
        let width: number | undefined;
        let height: number | undefined;
        let type = contentType;
        if (audio) {
          validateMediaAudio(await readFile(location), type);
        } else if (!video) {
          if (type === 'image/svg+xml') {
            validateMediaSvg(await readFile(location));
          } else if (!matchesRasterHeader(await readHeader(location), type)) {
            throw new MediaServiceError(
              'invalid_request',
              422,
              'Image content does not match its media type.',
            );
          }
          const metadata = await sharp(location).metadata();
          const mime = {
            png: 'image/png',
            jpeg: 'image/jpeg',
            webp: 'image/webp',
            svg: 'image/svg+xml',
          };
          if (!metadata.format || !(metadata.format in mime)) {
            throw new MediaServiceError('unsupported', 422, 'Unsupported image content.');
          }
          type = mime[metadata.format as keyof typeof mime];
          width = metadata.width;
          height = metadata.height;
          if (type !== contentType) {
            throw new MediaServiceError(
              'invalid_request',
              422,
              'Image content does not match its media type.',
            );
          }
        } else {
          const header = await readHeader(location);
          const valid =
            header.length >= 12 &&
            (type === 'video/mp4'
              ? header.toString('ascii', 4, 8) === 'ftyp'
              : type === 'video/webm' && header.readUInt32BE(0) === 0x1a45dfa3);
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
          .discardWrite(input.scope, receipt.writeId, new Date(now()).toISOString())
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
      const digest = hash.digest('hex');
      if (digest !== content.contentDigest) {
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
      return { asset, data, digest };
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
          source.expiredAt ?? new Date(now() + config.assets.orphanRetentionMs).toISOString(),
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
