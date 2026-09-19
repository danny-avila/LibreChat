import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { FileSources } from 'librechat-data-provider';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, unlink } from 'node:fs/promises';
import type { MediaOwnerScope } from '@librechat/data-schemas';
import type { FileStorage } from 'librechat-data-provider';
import type { GetURLParams, SaveBufferParams, UploadResult } from '~/storage/types';
import type { StorageByteRange, StorageReadOptions } from '~/storage/types';
import { extractKeyFromS3Url, getStorageMetadataForKey, parseS3Key } from '~/storage/s3/crud';
import { MediaServiceError } from './errors';

export type MediaStorageSource = FileStorage;
export type MediaObjectLocation = {
  source: string;
  storageKey?: string;
  storageRegion?: string;
  filepath: string;
};
export type MediaObjectRange = StorageByteRange;
export type MediaObjectReadOptions = StorageReadOptions;

export interface MediaObjectStore {
  readonly source: MediaStorageSource;
  /** Checks existing client configuration without contacting the external storage service. */
  isAvailable?(): Promise<boolean>;
  plan(
    scope: MediaOwnerScope,
    filename: string,
    type: string,
  ): Promise<MediaObjectLocation & { storageKey: string }>;
  put(
    scope: MediaOwnerScope,
    location: MediaObjectLocation,
    stagedPath: string,
    type: string,
  ): Promise<MediaObjectLocation>;
  open(
    scope: MediaOwnerScope,
    location: MediaObjectLocation,
    options?: MediaObjectReadOptions,
  ): Promise<Readable>;
  remove(scope: MediaOwnerScope, location: MediaObjectLocation): Promise<void>;
  revision?(scope: MediaOwnerScope, location: MediaObjectLocation): Promise<string>;
}

export async function removeMediaObjectLocations(
  scope: MediaOwnerScope,
  locations: MediaObjectLocation[],
  resolveStore: (source: string) => MediaObjectStore | undefined,
): Promise<void> {
  const unique = new Map(
    locations.map((location) => [
      `${location.source}:${location.storageRegion ?? ''}:${location.storageKey ?? location.filepath}`,
      location,
    ]),
  );
  for (const location of unique.values()) {
    const store = resolveStore(location.source);
    if (!store) throw new MediaServiceError('unsupported', 422, 'Media storage is unavailable.');
    await store.remove(scope, location);
  }
}

type StorageRequest = { user: { id: string; tenantId?: string } };

/** The existing host strategy contract, narrowed to byte storage without HTTP or database dependencies. */
export interface MediaFileStrategy {
  /** Host-supplied existing client/config getter; null means storage is not configured. */
  getStorageState?(): object | null | Promise<object | null>;
  getFileURL(params: GetURLParams): Promise<string | null>;
  saveBuffer(params: SaveBufferParams): Promise<string | null>;
  handleFileUpload(params: {
    req: StorageRequest;
    file: Pick<Express.Multer.File, 'path' | 'originalname' | 'mimetype' | 'size'>;
    file_id: string;
    basePath?: string;
    tenantId?: string | null;
    storageRegion?: string | null;
    includeRegionInPath?: boolean;
    useInlinePath?: boolean;
  }): Promise<UploadResult>;
  getDownloadStream(
    req: StorageRequest,
    filepath: string,
    options?: StorageReadOptions,
  ): Promise<Readable>;
  deleteFile(
    req: StorageRequest,
    file: MediaObjectLocation & { user: string; tenantId?: string | null },
  ): Promise<void>;
  /** Firebase already exports this key-based primitive; it works before an upload URL is known. */
  deleteStoredFile?(basePath: string, filename: string): Promise<void>;
}

export type MediaStrategyResolver = (source: MediaStorageSource) => MediaFileStrategy;

function assertScope(scope: MediaOwnerScope): void {
  if (
    !/^[A-Za-z0-9_-]+$/.test(scope.ownerId) ||
    (scope.tenantId != null && !/^[A-Za-z0-9_-]+$/.test(scope.tenantId))
  ) {
    throw new MediaServiceError('invalid_request', 400, 'Invalid media storage owner.');
  }
}

function missing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (
    ('code' in error &&
      ['ENOENT', 'storage/object-not-found', 'BlobNotFound', 'NoSuchKey'].includes(
        String(error.code),
      )) ||
    ('statusCode' in error && error.statusCode === 404) ||
    ('name' in error && ['NotFound', 'NoSuchKey'].includes(String(error.name)))
  );
}

export function createLocalMediaObjectStore({
  imageDirectory,
  uploadDirectory,
}: {
  imageDirectory: string;
  uploadDirectory: string;
}): MediaObjectStore {
  const roots = { images: path.resolve(imageDirectory), uploads: path.resolve(uploadDirectory) };
  const resolve = (location: MediaObjectLocation): string => {
    const key = location.storageKey ?? location.filepath.replace(/^\//, '');
    const prefix = (['images', 'uploads'] as const).find((value) => key.startsWith(`${value}/`));
    if (location.source !== 'local' || !prefix)
      throw new MediaServiceError('not_found', 404, 'Media content is unavailable.');
    const destination = path.resolve(roots[prefix], key.slice(prefix.length + 1));
    const relative = path.relative(roots[prefix], destination);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
      throw new MediaServiceError('not_found', 404, 'Media content is unavailable.');
    return destination;
  };
  return {
    source: FileSources.local,
    async plan(scope, filename) {
      assertScope(scope);
      const key = `images/${scope.tenantId ? `t/${scope.tenantId}/` : ''}${scope.ownerId}/${path.basename(filename)}`;
      await mkdir(
        path.dirname(resolve({ source: 'local', storageKey: key, filepath: `/${key}` })),
        { recursive: true },
      );
      return { source: 'local', storageKey: key, filepath: `/${key}` };
    },
    async put(_scope, location, stagedPath) {
      const destination = resolve(location);
      await mkdir(path.dirname(destination), { recursive: true });
      await pipeline(
        createReadStream(stagedPath),
        createWriteStream(destination, { flags: 'wx', mode: 0o600 }),
      );
      return location;
    },
    async open(_scope, location, options) {
      return createReadStream(resolve(location), { ...options?.range, signal: options?.signal });
    },
    async remove(_scope, location) {
      try {
        await unlink(resolve(location));
      } catch (error) {
        if (!missing(error)) throw error;
      }
    },
    async revision(_scope, location) {
      const info = await stat(resolve(location));
      return `${info.ino}:${info.size}:${info.mtimeMs}`;
    },
  };
}

/** Reuses the application's initialized storage strategies, credentials, buckets, and URL policies. */
export function createMediaStrategyObjectStores(
  resolveStrategy: MediaStrategyResolver,
): MediaObjectStore[] {
  return (
    [FileSources.s3, FileSources.cloudfront, FileSources.azure_blob, FileSources.firebase] as const
  ).map((source) => {
    const request = (scope: MediaOwnerScope): StorageRequest => ({
      user: { id: scope.ownerId, tenantId: scope.tenantId ?? undefined },
    });
    const basePath = (scope: MediaOwnerScope) =>
      source === 's3' || source === 'cloudfront' || !scope.tenantId
        ? 'images'
        : `t/${scope.tenantId}/images`;
    return {
      source,
      async isAvailable() {
        try {
          const strategy = resolveStrategy(source);
          if (!strategy.getStorageState) return true;
          return (await strategy.getStorageState()) != null;
        } catch {
          return false;
        }
      },
      async plan(scope, filename, type) {
        assertScope(scope);
        const name = `media__${path.basename(filename)}`;
        const base = basePath(scope);
        const storageKey = `${base}/${scope.ownerId}/${name}`;
        if (source === 'firebase') return { source, storageKey, filepath: storageKey };
        const filepath = await resolveStrategy(source).getFileURL({
          userId: scope.ownerId,
          fileName: name,
          basePath: base,
          tenantId: scope.tenantId,
          contentType: type,
          useInlinePath: source === 'cloudfront' && type.startsWith('image/'),
        });
        if (!filepath)
          throw new MediaServiceError(
            'storage_failed',
            503,
            'Media storage could not locate the upload.',
          );
        return source === 's3' || source === 'cloudfront'
          ? {
              source,
              filepath,
              ...getStorageMetadataForKey(extractKeyFromS3Url(filepath)),
              storageKey: extractKeyFromS3Url(filepath),
            }
          : { source, filepath, storageKey };
      },
      async put(scope, location, stagedPath, type) {
        const strategy = resolveStrategy(source);
        if (source === 'firebase') {
          const filepath = await strategy.saveBuffer({
            userId: scope.ownerId,
            buffer: await readFile(stagedPath),
            fileName: path.posix.basename(location.storageKey ?? ''),
            basePath: basePath(scope),
          });
          if (!filepath)
            throw new MediaServiceError(
              'storage_failed',
              503,
              'Media storage did not confirm the upload.',
            );
          return { ...location, filepath };
        }
        const parts =
          source === 's3' || source === 'cloudfront'
            ? parseS3Key(location.storageKey ?? '')
            : undefined;
        const result = await strategy.handleFileUpload({
          req: request(scope),
          file: {
            path: stagedPath,
            originalname: path.basename(stagedPath),
            mimetype: type,
            size: (await stat(stagedPath)).size,
          },
          file_id: 'media',
          basePath: parts?.basePath ?? basePath(scope),
          tenantId: scope.tenantId,
          storageRegion: parts?.storageRegion,
          includeRegionInPath: parts?.includeRegionInPath,
          useInlinePath: parts?.useInlinePath,
        });
        if (!result.filepath || (result.storageKey && result.storageKey !== location.storageKey))
          throw new MediaServiceError(
            'storage_failed',
            409,
            'Media storage changed the planned object key.',
          );
        return {
          ...location,
          filepath: result.filepath,
          storageRegion: result.storageRegion ?? location.storageRegion,
        };
      },
      async open(scope, location, options) {
        const stream = await resolveStrategy(source).getDownloadStream(
          request(scope),
          source === 's3' || source === 'cloudfront'
            ? (location.storageKey ?? location.filepath)
            : location.filepath,
          options,
        );
        return stream;
      },
      async remove(scope, location) {
        try {
          const strategy = resolveStrategy(source);
          if (source === 'firebase' && location.storageKey && strategy.deleteStoredFile) {
            await strategy.deleteStoredFile('', location.storageKey);
            return;
          }
          await strategy.deleteFile(request(scope), {
            ...location,
            user: scope.ownerId,
            tenantId: scope.tenantId,
          });
        } catch (error) {
          if (!missing(error)) throw error;
        }
      },
    };
  });
}
