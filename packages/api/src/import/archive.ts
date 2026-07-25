import fs from 'fs';
import path from 'path';
import yauzl from 'yauzl';
import { Transform } from 'stream';
import { megabyte } from 'librechat-data-provider';

import type { Readable, TransformCallback } from 'stream';

import { ZipBombError } from '~/files/documents/zipSafety';

export { ZipBombError };

const DEFAULT_MAX_ENTRIES = 20000;
const DEFAULT_MAX_ENTRY_BYTES = 512 * megabyte;
const DEFAULT_MAX_TOTAL_BYTES = 4096 * megabyte;
/** Local file header signature every ZIP file begins with. Its absence
 * means the upload is a bare file (e.g. a legacy un-zipped ChatGPT
 * `.json` export), not that it is malformed — `openArchive` wraps it in a
 * single-entry `Archive` instead of attempting to parse it as a zip. */
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

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

type ArchiveLimits = Required<ArchiveOptions>;

/** Actual decompressed bytes delivered so far, shared by every `read()`
 * and `stream()` call on one archive instance so the aggregate cap is
 * enforced against real bytes rather than the (spoofable) central
 * directory total. */
interface ArchiveTotals {
  bytesRead: number;
}

export function assertSafeName(name: string): void {
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
  options: ArchiveLimits,
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

      /** Cheap early reject from the central directory's declared sizes.
       * This field is attacker-controlled and not trusted on its own —
       * `ArchiveTotals` re-checks the real, streamed byte count on every
       * `read()`/`stream()` call regardless of what this loop found. */
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

function ensureWithinTotalBudget(name: string, limits: ArchiveLimits, totals: ArchiveTotals): void {
  if (totals.bytesRead > limits.maxTotalBytes) {
    throw new ZipBombError(`Archive exceeds the maximum decompressed size before reading ${name}`);
  }
}

/**
 * Wraps a raw entry stream in a counting `Transform` so `.stream()`
 * enforces the same per-entry and aggregate caps as `.read()`, against
 * actual decompressed bytes as they flow rather than declared sizes.
 * Exceeding either cap destroys the stream with a `ZipBombError` instead
 * of forwarding the chunk that crossed it.
 */
function createCappingTransform(
  name: string,
  limits: ArchiveLimits,
  totals: ArchiveTotals,
): Transform {
  let entryBytes = 0;

  return new Transform({
    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
      entryBytes += chunk.byteLength;
      totals.bytesRead += chunk.byteLength;

      if (entryBytes > limits.maxEntryBytes) {
        callback(new ZipBombError(`Entry ${name} exceeds the maximum decompressed size`));
        return;
      }
      if (totals.bytesRead > limits.maxTotalBytes) {
        callback(new ZipBombError('Archive exceeds the maximum decompressed size'));
        return;
      }
      callback(null, chunk);
    },
  });
}

async function isZipFile(filepath: string): Promise<boolean> {
  const handle = await fs.promises.open(filepath, 'r');
  try {
    const buffer = Buffer.alloc(ZIP_SIGNATURE.length);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return bytesRead === buffer.length && buffer.equals(ZIP_SIGNATURE);
  } finally {
    await handle.close();
  }
}

/**
 * Wraps a bare (non-zip) upload in the same `Archive` interface a real zip
 * exposes: one entry, named after the uploaded file, readable/streamable
 * under the same per-entry and aggregate byte caps. `resolveLayout`'s
 * lone-json fallback then treats it exactly like a single-file zip export,
 * so a bare `.json` upload and a `.zip` upload share one inspect/import
 * pipeline instead of two.
 */
async function openSingleFileArchive(
  filepath: string,
  limits: ArchiveLimits,
  totals: ArchiveTotals,
): Promise<Archive> {
  const name = path.basename(filepath);
  const stat = await fs.promises.stat(filepath);

  if (stat.size > limits.maxTotalBytes) {
    throw new ZipBombError('Archive exceeds the maximum decompressed size');
  }

  function assertKnownEntry(entryName: string): void {
    if (entryName !== name) {
      throw new Error(`Entry not found in archive: ${entryName}`);
    }
  }

  async function read(entryName: string): Promise<Buffer> {
    assertKnownEntry(entryName);
    ensureWithinTotalBudget(entryName, limits, totals);
    const readStream = fs.createReadStream(filepath);

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let bytes = 0;

      readStream.on('data', (chunk: Buffer | string) => {
        const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        bytes += buffer.byteLength;
        totals.bytesRead += buffer.byteLength;

        if (bytes > limits.maxEntryBytes) {
          reject(new ZipBombError(`Entry ${entryName} exceeds the maximum decompressed size`));
          readStream.destroy();
          return;
        }
        if (totals.bytesRead > limits.maxTotalBytes) {
          reject(new ZipBombError('Archive exceeds the maximum decompressed size'));
          readStream.destroy();
          return;
        }
        chunks.push(buffer);
      });
      readStream.on('error', reject);
      readStream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  async function stream(entryName: string): Promise<Readable> {
    assertKnownEntry(entryName);
    ensureWithinTotalBudget(entryName, limits, totals);
    const readStream = fs.createReadStream(filepath);
    const capped = createCappingTransform(entryName, limits, totals);

    readStream.on('error', (error) => capped.destroy(error));
    capped.on('close', () => {
      if (!readStream.destroyed) {
        readStream.destroy();
      }
    });

    return readStream.pipe(capped);
  }

  return {
    entries: [{ name, bytes: stat.size }],
    read,
    stream,
    close: () => undefined,
  };
}

export async function openArchive(
  filepath: string,
  options: ArchiveOptions = {},
): Promise<Archive> {
  const limits: ArchiveLimits = {
    maxEntries: options.maxEntries ?? DEFAULT_MAX_ENTRIES,
    maxEntryBytes: options.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES,
    maxTotalBytes: options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES,
  };
  const totals: ArchiveTotals = { bytesRead: 0 };

  if (!(await isZipFile(filepath))) {
    return openSingleFileArchive(filepath, limits, totals);
  }

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
    ensureWithinTotalBudget(name, limits, totals);
    const entry = entryOf(name);
    const readStream = await openEntryStream(zipfile, entry);
    const capped = createCappingTransform(name, limits, totals);

    readStream.on('error', (error) => capped.destroy(error));
    capped.on('close', () => {
      if (!readStream.destroyed) {
        readStream.destroy();
      }
    });

    return readStream.pipe(capped);
  }

  async function read(name: string): Promise<Buffer> {
    ensureWithinTotalBudget(name, limits, totals);
    const entry = entryOf(name);
    const readStream = await openEntryStream(zipfile, entry);

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let bytes = 0;

      readStream.on('data', (chunk: Buffer) => {
        bytes += chunk.byteLength;
        totals.bytesRead += chunk.byteLength;

        if (bytes > limits.maxEntryBytes) {
          reject(new ZipBombError(`Entry ${name} exceeds the maximum decompressed size`));
          readStream.destroy();
          return;
        }
        if (totals.bytesRead > limits.maxTotalBytes) {
          reject(new ZipBombError('Archive exceeds the maximum decompressed size'));
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
