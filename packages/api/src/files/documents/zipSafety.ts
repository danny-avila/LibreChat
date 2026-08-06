import yauzl from 'yauzl';
import { megabyte } from 'librechat-data-provider';

/**
 * Default per-archive total decompressed-size cap. Office documents in
 * normal use rarely exceed a few MB inflated; 100 MB leaves generous
 * headroom for image-heavy templates while still catching the
 * pathological zip-bomb case (e.g. a 1 MB compressed XLSX that inflates
 * to 200+ MB of XML — see SEC review on PR #12934).
 */
const DEFAULT_MAX_TOTAL_BYTES = 100 * megabyte;

/**
 * Default per-entry decompressed-size cap. A single inflated entry
 * larger than this is essentially always either a bomb or content the
 * downstream parser would balk at anyway.
 */
const DEFAULT_MAX_ENTRY_BYTES = 25 * megabyte;

/** End-Of-Central-Directory record signature, `PK\x05\x06`. */
const EOCD_SIGNATURE = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

/** Fixed size of the EOCD record, before its variable-length comment. */
const EOCD_RECORD_BYTES = 22;

/** Largest legal EOCD tail: the fixed record plus a 65535-byte comment. */
const EOCD_SCAN_BYTES = EOCD_RECORD_BYTES + 65535;

/**
 * Tag-distinct error so callers (e.g. the office HTML producers and the
 * RAG document parser) can distinguish a refused zip-bomb from generic
 * parse failures and emit a sensible "file too large to preview" UI
 * instead of silently degrading.
 */
export class ZipBombError extends Error {
  readonly code = 'ZIP_BOMB';
  constructor(message: string) {
    super(message);
    this.name = 'ZipBombError';
  }
}

export interface ZipSafetyOptions {
  /** Per-archive total decompressed-byte cap. */
  maxTotalBytes?: number;
  /** Per-entry decompressed-byte cap. */
  maxEntryBytes?: number;
  /** Filename for error messages — does not need to match disk. */
  name?: string;
}

/**
 * Validate that a ZIP-backed buffer (DOCX, XLSX, XLS-as-OOXML, ODS,
 * ODT, PPTX, …) does not blow up under decompression beyond the given
 * caps. Streams every entry through yauzl and counts real decompressed
 * bytes mid-inflate — the central directory's `uncompressedSize` cannot
 * be trusted (it can be falsified to lie about the payload, the
 * specific bypass technique used in the SEC validation PoC for
 * PR #12934).
 *
 * Drops the decompressed bytes immediately (only counts them), so the
 * validator's own memory footprint is bounded by yauzl's stream
 * buffer regardless of payload size. CPU is bounded by `maxTotalBytes`
 * — once the cap fires, the underlying read stream is destroyed and
 * decompression stops.
 *
 * Throws `ZipBombError` on cap violation; throws plain `Error` on a
 * malformed ZIP. Resolves with `void` when the archive is fully walked
 * within caps.
 */
export function assertSafeZipSize(buffer: Buffer, options: ZipSafetyOptions = {}): Promise<void> {
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const maxEntryBytes = options.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES;
  const label = options.name ?? 'archive';

  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        return reject(err);
      }
      if (!zipfile) {
        return reject(new Error('Failed to open zip buffer'));
      }

      let settled = false;
      let totalDecompressed = 0;
      const finish = (error: Error | null) => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          zipfile.close();
        } catch {
          /* zipfile.close() is best-effort — yauzl will throw if a
           * stream is mid-flight. We've already settled the outer
           * promise, so swallow this. */
        }
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      zipfile.readEntry();

      zipfile.on('entry', (entry: yauzl.Entry) => {
        /* Directory entries (trailing slash) are zero-byte and don't
         * need to be opened. Saves a stream allocation per directory
         * in archives like .docx that have nested subfolders. */
        if (/\/$/.test(entry.fileName)) {
          zipfile.readEntry();
          return;
        }

        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr || !readStream) {
            return finish(streamErr ?? new Error('Failed to open zip entry stream'));
          }

          let entryBytes = 0;
          let entryCapped = false;

          readStream.on('data', (chunk: Buffer) => {
            if (entryCapped) {
              return;
            }
            entryBytes += chunk.byteLength;
            totalDecompressed += chunk.byteLength;
            if (entryBytes > maxEntryBytes) {
              entryCapped = true;
              readStream.destroy();
              finish(
                new ZipBombError(
                  `${label}: entry "${entry.fileName}" exceeds the ${
                    maxEntryBytes / megabyte
                  }MB per-entry decompressed cap`,
                ),
              );
              return;
            }
            if (totalDecompressed > maxTotalBytes) {
              entryCapped = true;
              readStream.destroy();
              finish(
                new ZipBombError(
                  `${label}: total decompressed size exceeds the ${
                    maxTotalBytes / megabyte
                  }MB cap (zip bomb suspected)`,
                ),
              );
              return;
            }
          });

          readStream.on('end', () => {
            if (!settled) {
              zipfile.readEntry();
            }
          });
          readStream.on('error', (readErr: Error) => {
            if (!entryCapped) {
              finish(readErr);
            }
          });
        });
      });

      zipfile.on('end', () => finish(null));
      zipfile.on('error', (zipErr: Error) => finish(zipErr));
    });
  });
}

/**
 * Detects a ZIP archive the way the consuming parsers do: by locating the
 * End-Of-Central-Directory record from the tail.
 *
 * Testing the leading `PK` magic bytes is not enough. Real zip readers (anydoc's
 * Rust zip crate, SheetJS) seek the EOCD backwards from the end of the file and
 * tolerate arbitrary prepended data — that is how self-extracting archives work.
 * Prepending a few junk bytes to a zip bomb therefore makes a magic-byte test
 * report "not a zip" while the parser still happily inflates it.
 *
 * Candidate signatures are confirmed by checking that the record's declared
 * comment length runs exactly to the end of the buffer, so a stray `PK\x05\x06`
 * inside an unrelated binary (a `.xls` CFB container, say) is not mistaken for
 * an archive.
 */
export function isZipArchive(buffer: Buffer): boolean {
  if (buffer.length < EOCD_RECORD_BYTES) {
    return false;
  }
  const tail =
    buffer.length > EOCD_SCAN_BYTES ? buffer.subarray(buffer.length - EOCD_SCAN_BYTES) : buffer;

  let index = tail.lastIndexOf(EOCD_SIGNATURE, tail.length - EOCD_RECORD_BYTES);
  while (index >= 0) {
    if (index + EOCD_RECORD_BYTES + tail.readUInt16LE(index + 20) === tail.length) {
      return true;
    }
    if (index === 0) {
      return false;
    }
    index = tail.lastIndexOf(EOCD_SIGNATURE, index - 1);
  }
  return false;
}

/**
 * Runs the decompression guard when — and only when — the buffer really is a ZIP.
 *
 * Detection and enforcement have to stay welded together. Once the tail says
 * "archive", a validator failure is a rejection and never a fall-through: yauzl
 * does not compensate for the offset shift that prepended bytes introduce, so a
 * padded bomb surfaces here as a malformed-central-directory error, and passing
 * that to the parser would hand it exactly the file the guard exists to stop.
 * Non-archives (`.xls` is CFB, not ZIP) skip the validator entirely, which is
 * why the check cannot simply be made unconditional.
 */
export async function assertSafeZipSizeIfArchive(
  buffer: Buffer,
  options: ZipSafetyOptions = {},
): Promise<void> {
  if (!isZipArchive(buffer)) {
    return;
  }
  await assertSafeZipSize(buffer, options);
}
