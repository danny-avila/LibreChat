import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, lstat, rm, unlink } from 'node:fs/promises';
import type { MediaConfig } from 'librechat-data-provider';
import type { Request } from 'express';
import { mediaContentByteLimit, normalizeMediaContentType } from './content';
import { MediaByteCounter } from './storage';

type UploadFile = Express.Multer.File;

/** Structural subset of multer's `StorageEngine`, so the host can hand in multer itself. */
export interface MediaUploadStorage {
  _handleFile(
    req: Request,
    file: UploadFile,
    callback: (error: Error | null, info?: Partial<UploadFile>) => void,
  ): void;
  _removeFile(req: Request, file: UploadFile, callback: (error: Error | null) => void): void;
}

export interface MediaStaging {
  readonly directory: string;
  /** Writes one upload to staging, bounded by the limit of its declared media type. */
  storage(config: MediaConfig): MediaUploadStorage;
  /** Removes staged files last modified before `staleBefore`; returns how many were removed. */
  sweep(staleBefore: number): Promise<number>;
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function asError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}

export function createMediaStaging({
  directory,
  id,
}: {
  directory: string;
  id: () => string;
}): MediaStaging {
  const root = path.resolve(directory);
  const remove = (location: string) =>
    unlink(location).catch((error: unknown) => {
      if (!isMissing(error)) throw error;
    });

  return {
    directory: root,
    storage(config) {
      return {
        _handleFile(_req, file, callback) {
          const limit = mediaContentByteLimit(normalizeMediaContentType(file.mimetype), config);
          const filename = id();
          const location = path.join(root, filename);
          let settled = false;
          const settle = (error: Error | null, info?: Partial<UploadFile>) => {
            if (settled) return;
            settled = true;
            callback(error, info);
          };
          mkdir(root, { recursive: true }).then(
            () => {
              const counter = new MediaByteCounter(limit);
              const out = createWriteStream(location, { flags: 'wx', mode: 0o600 });
              const fail = (error: Error) => {
                file.stream.unpipe(counter);
                file.stream.resume();
                const discard = () =>
                  remove(location).then(
                    () => settle(error),
                    () => settle(error),
                  );
                if (out.closed) {
                  void discard();
                  return;
                }
                out.once('close', () => void discard());
                out.destroy();
              };
              counter.once('error', fail);
              out.once('error', fail);
              out.once('finish', () =>
                settle(null, { destination: root, filename, path: location, size: counter.bytes }),
              );
              file.stream.pipe(counter).pipe(out);
            },
            (error: unknown) => settle(asError(error, 'Media staging is unavailable.')),
          );
        },
        _removeFile(_req, file, callback) {
          remove(file.path).then(
            () => callback(null),
            (error: unknown) => callback(asError(error, 'Media staging cleanup failed.')),
          );
        },
      };
    },
    async sweep(staleBefore) {
      let entries: string[];
      try {
        entries = await readdir(root);
      } catch (error) {
        if (isMissing(error)) return 0;
        throw error;
      }
      const removed = await Promise.all(
        entries.map(async (entry) => {
          const location = path.resolve(root, entry);
          const relative = path.relative(root, location);
          if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return false;
          try {
            const info = await lstat(location);
            if (info.isSymbolicLink() || info.mtimeMs >= staleBefore) return false;
            if (info.isDirectory()) await rm(location, { recursive: true, force: true });
            else if (info.isFile()) await remove(location);
            else return false;
            return true;
          } catch (error) {
            if (isMissing(error)) return false;
            throw error;
          }
        }),
      );
      return removed.filter(Boolean).length;
    },
  };
}
