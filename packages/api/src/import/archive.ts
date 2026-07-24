import path from 'path';
import yauzl from 'yauzl';
import { megabyte } from 'librechat-data-provider';

import type { Readable } from 'stream';

import { ZipBombError } from '~/files/documents/zipSafety';

export { ZipBombError };

const DEFAULT_MAX_ENTRIES = 20000;
const DEFAULT_MAX_ENTRY_BYTES = 512 * megabyte;
const DEFAULT_MAX_TOTAL_BYTES = 4096 * megabyte;

export interface ArchiveEntry {
  name: string;
  bytes: number;
}

export interface ArchiveOptions {
  maxEntries?: number;
  maxEntryBytes?: number;
  maxTotalBytes?: number;
}

export interface Archive {
  entries: ArchiveEntry[];
  read(name: string): Promise<Buffer>;
  stream(name: string): Promise<Readable>;
  close(): void;
}

function assertSafeName(name: string): void {
  if (path.isAbsolute(name) || /^[a-zA-Z]:[\\/]/.test(name)) {
    throw new Error(`Refusing absolute path in archive: ${name}`);
  }
  const normalized = path.normalize(name);
  if (normalized.startsWith('..') || normalized.includes(`..${path.sep}`)) {
    throw new Error(`Refusing path traversal in archive: ${name}`);
  }
}

/**
 * yauzl validates entry names itself before an `entry` event is ever
 * emitted, rejecting the whole read with a generic `Error` ("invalid
 * relative path: ...", "absolute path: ..."). Translate those into the
 * same wording `assertSafeName` uses so callers get one consistent
 * traversal/absolute-path error regardless of which layer caught it.
 */
function translateZipSafetyError(error: Error): Error {
  if (/^invalid relative path:/.test(error.message)) {
    return new Error(`Refusing path traversal in archive: ${error.message}`);
  }
  if (/^absolute path:/.test(error.message)) {
    return new Error(`Refusing absolute path in archive: ${error.message}`);
  }
  return error;
}

function openZip(filepath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filepath, { lazyEntries: true, autoClose: false }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err ?? new Error('Unable to read archive'));
        return;
      }
      resolve(zipfile);
    });
  });
}

function indexEntries(
  zipfile: yauzl.ZipFile,
  options: Required<ArchiveOptions>,
): Promise<Map<string, yauzl.Entry>> {
  return new Promise((resolve, reject) => {
    const index = new Map<string, yauzl.Entry>();
    let total = 0;

    zipfile.on('entry', (entry: yauzl.Entry) => {
      if (/\/$/.test(entry.fileName)) {
        zipfile.readEntry();
        return;
      }

      try {
        assertSafeName(entry.fileName);
      } catch (error) {
        reject(error);
        return;
      }

      if (index.size + 1 > options.maxEntries) {
        reject(new ZipBombError(`Archive exceeds ${options.maxEntries} entries`));
        return;
      }

      total += entry.uncompressedSize;
      if (total > options.maxTotalBytes) {
        reject(new ZipBombError('Archive exceeds the maximum decompressed size'));
        return;
      }

      index.set(entry.fileName, entry);
      zipfile.readEntry();
    });

    zipfile.on('end', () => resolve(index));
    zipfile.on('error', (error: Error) => reject(translateZipSafetyError(error)));
    zipfile.readEntry();
  });
}

function openEntryStream(zipfile: yauzl.ZipFile, entry: yauzl.Entry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, readStream) => {
      if (err || !readStream) {
        reject(err ?? new Error(`Unable to read entry: ${entry.fileName}`));
        return;
      }
      resolve(readStream);
    });
  });
}

export async function openArchive(
  filepath: string,
  options: ArchiveOptions = {},
): Promise<Archive> {
  const limits: Required<ArchiveOptions> = {
    maxEntries: options.maxEntries ?? DEFAULT_MAX_ENTRIES,
    maxEntryBytes: options.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES,
    maxTotalBytes: options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES,
  };

  const zipfile = await openZip(filepath);

  let index: Map<string, yauzl.Entry>;
  try {
    index = await indexEntries(zipfile, limits);
  } catch (error) {
    zipfile.close();
    throw error;
  }

  function entryOf(name: string): yauzl.Entry {
    const entry = index.get(name);
    if (!entry) {
      throw new Error(`Entry not found in archive: ${name}`);
    }
    return entry;
  }

  async function stream(name: string): Promise<Readable> {
    return openEntryStream(zipfile, entryOf(name));
  }

  async function read(name: string): Promise<Buffer> {
    const entry = entryOf(name);
    const readStream = await openEntryStream(zipfile, entry);

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let bytes = 0;

      readStream.on('data', (chunk: Buffer) => {
        bytes += chunk.byteLength;
        if (bytes > limits.maxEntryBytes) {
          reject(new ZipBombError(`Entry ${name} exceeds the maximum decompressed size`));
          readStream.destroy();
          return;
        }
        chunks.push(chunk);
      });
      readStream.on('error', reject);
      readStream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  return {
    entries: Array.from(index.values(), (entry) => ({
      name: entry.fileName,
      bytes: entry.uncompressedSize,
    })),
    read,
    stream,
    close: () => zipfile.close(),
  };
}
