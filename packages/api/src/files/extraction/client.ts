import { request } from 'node:http';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { extractionServiceSchema } from 'librechat-data-provider';
import type { ExtractionServiceConfig } from 'librechat-data-provider';

export type ExtractionFormat = 'pdf' | 'docx';
export interface ExtractionSegment {
  readonly kind: 'page' | 'document';
  readonly index: number;
  readonly text: string;
}
export interface ExtractionResult {
  readonly version: 1;
  readonly operation: 'document.extract-text';
  readonly format: ExtractionFormat;
  readonly inputSha256: string;
  readonly textBytes: number;
  readonly segments: readonly ExtractionSegment[];
}
export interface DocumentExtractor {
  readonly maxInputBytes: number;
  extract(bytes: Buffer, format: ExtractionFormat, signal?: AbortSignal): Promise<ExtractionResult>;
}

const statuses: Readonly<Record<string, number>> = {
  INVALID_REQUEST: 400,
  INPUT_LIMIT: 413,
  OUTPUT_LIMIT: 413,
  DECOMPRESSION_LIMIT: 413,
  STRUCTURE_LIMIT: 413,
  BUSY: 429,
  UNAVAILABLE: 503,
  DEADLINE: 504,
  CANCELLED: 422,
  INVALID_DOCUMENT: 422,
  EMPTY_OUTPUT: 422,
  ENCRYPTED_DOCUMENT: 422,
  UNSUPPORTED_ENCODING: 422,
  UNSUPPORTED_CONTENT: 422,
  RESOURCE_LIMIT: 422,
};

export class ExtractionServiceError extends Error {
  constructor(readonly code: string) {
    super(`Document extraction failed (${code}).`);
    this.name = 'ExtractionServiceError';
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every((key) => key in value);
}
function fail(code = 'INVALID_RESPONSE'): never {
  throw new ExtractionServiceError(code);
}
function decode(bytes: Buffer): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
}
function positive(value: unknown, ceiling: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= ceiling;
}
function wellFormed(text: string): boolean {
  // JSON permits escaped lone surrogates even after strict UTF-8 decoding.
  return !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text);
}

/** Only semantic PDF/DOCX extraction is migrated. Preview/HTML producers remain independent. */
export function getExtractionFormat(name: string, mimeType: string): ExtractionFormat | null {
  const mime = mimeType.split(';', 1)[0].trim().toLowerCase();
  if (/\.pdf$/i.test(name) || mime === 'application/pdf') return 'pdf';
  if (
    /\.docx$/i.test(name) ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
    return 'docx';
  return null;
}

/** No cache, retries, alternate endpoints, or local parser fallback. The owner injects this client. */
export function createDocumentExtractor(
  config?: ExtractionServiceConfig,
  transport: typeof request = request,
): DocumentExtractor | undefined {
  if (config == null) return undefined;
  const parsed = extractionServiceSchema.safeParse(config);
  if (!parsed.success) return fail('INVALID_CONFIG');
  const options = parsed.data;
  if (!options.enabled) return undefined;

  const exchange = (
    path: '/v1/capabilities' | '/v1/extract-text',
    signal: AbortSignal,
    limit: number,
    body?: Buffer,
    format?: ExtractionFormat,
  ): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const req = transport(
        {
          socketPath: options.socketPath,
          path,
          method: body ? 'POST' : 'GET',
          agent: false,
          maxHeaderSize: 4096,
          signal,
          headers: {
            Host: 'localhost',
            Connection: 'close',
            ...(body
              ? {
                  'Content-Type': 'application/octet-stream',
                  'Content-Length': body.length,
                  'X-Extraction-Version': '1',
                  'X-Extraction-Format': format,
                }
              : {}),
          },
        },
        (res) => {
          const length = res.headers['content-length'];
          if (
            res.headers['transfer-encoding'] ||
            res.headers['content-encoding'] ||
            res.headers['content-type'] !== 'application/json; charset=utf-8' ||
            typeof length !== 'string' ||
            !/^[1-9]\d*$/.test(length) ||
            !positive(Number(length), limit)
          ) {
            reject(new ExtractionServiceError('INVALID_RESPONSE'));
            res.destroy();
            req.destroy();
            return;
          }
          let size = 0;
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > limit || size > Number(length)) {
              reject(new ExtractionServiceError('RESPONSE_LIMIT'));
              res.destroy();
              req.destroy();
              return;
            }
            chunks.push(chunk);
          });
          res.once('error', () => reject(new ExtractionServiceError('INVALID_RESPONSE')));
          res.once('end', () => {
            try {
              if (size !== Number(length)) return fail();
              const value = decode(Buffer.concat(chunks, size));
              if (res.statusCode !== 200) {
                if (
                  !record(value) ||
                  !keys(value, ['error']) ||
                  !record(value.error) ||
                  !keys(value.error, ['code']) ||
                  typeof value.error.code !== 'string' ||
                  statuses[value.error.code] !== res.statusCode
                )
                  return fail();
                return fail(value.error.code);
              }
              resolve(value);
            } catch (error) {
              reject(error);
            }
          });
        },
      );
      req.once('error', () => reject(new ExtractionServiceError('UNAVAILABLE')));
      req.end(body);
    });

  return {
    maxInputBytes: options.maxInputBytes,
    async extract(input, format, signal) {
      if (format !== 'pdf' && format !== 'docx') return fail('UNSUPPORTED_FORMAT');
      if (!input.length || input.length > options.maxInputBytes) return fail('INPUT_LIMIT');
      // Snapshot before awaiting capabilities so the digest always describes the bytes sent.
      const bytes = Buffer.from(input);
      const digest = createHash('sha256').update(bytes).digest('hex');
      const controller = new AbortController();
      const cancel = () => controller.abort(new ExtractionServiceError('CANCELLED'));
      const timeout = setTimeout(
        () => controller.abort(new ExtractionServiceError('DEADLINE')),
        options.deadlineMs,
      );
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
      try {
        controller.signal.throwIfAborted();
        const caps = await exchange('/v1/capabilities', controller.signal, 16384);
        if (
          !record(caps) ||
          caps.version !== 1 ||
          caps.operation !== 'document.extract-text' ||
          !Array.isArray(caps.formats) ||
          caps.formats.length !== 2 ||
          !caps.formats.includes('pdf') ||
          !caps.formats.includes('docx') ||
          !record(caps.structure) ||
          !record(caps.limitations) ||
          !record(caps.limits)
        ) {
          return fail('INCOMPATIBLE_SERVICE');
        }
        for (const type of ['pdf', 'docx']) {
          if (
            typeof caps.structure[type] !== 'string' ||
            !caps.structure[type] ||
            typeof caps.limitations[type] !== 'string' ||
            !caps.limitations[type]
          )
            return fail('INCOMPATIBLE_SERVICE');
        }
        const limits = caps.limits;
        const ceilings: Record<string, number> = {
          inputBytes: 10 * 1024 * 1024,
          textBytes: 1024 * 1024,
          resultBytes: 3 * 1024 * 1024,
          deadlineMs: 10000,
          maxSegments: 128,
          concurrency: 2,
          expandedBytes: 32 * 1024 * 1024,
          archiveEntries: 512,
          tableColumns: 512,
        };
        for (const [key, ceiling] of Object.entries(ceilings)) {
          if (!positive(limits[key], ceiling)) return fail('INCOMPATIBLE_SERVICE');
        }
        if (bytes.length > (limits.inputBytes as number)) return fail('INPUT_LIMIT');
        const value = await exchange(
          '/v1/extract-text',
          controller.signal,
          Math.min(options.maxResponseBytes, limits.resultBytes as number),
          bytes,
          format,
        );
        if (
          !record(value) ||
          !keys(value, [
            'version',
            'operation',
            'format',
            'inputSha256',
            'textBytes',
            'segments',
          ]) ||
          value.version !== 1 ||
          value.operation !== 'document.extract-text' ||
          value.format !== format ||
          value.inputSha256 !== digest ||
          !Array.isArray(value.segments) ||
          !value.segments.length ||
          value.segments.length >
            Math.min(options.maxSegments, limits.maxSegments as number, format === 'pdf' ? 128 : 1)
        )
          return fail();
        let textBytes = 0;
        let nonempty = false;
        for (const [index, segment] of value.segments.entries()) {
          if (
            !record(segment) ||
            !keys(segment, ['kind', 'index', 'text']) ||
            segment.kind !== (format === 'pdf' ? 'page' : 'document') ||
            segment.index !== index + 1 ||
            typeof segment.text !== 'string' ||
            !wellFormed(segment.text)
          )
            return fail();
          textBytes += Buffer.byteLength(segment.text, 'utf8');
          nonempty ||= Boolean(segment.text.trim());
        }
        if (
          !nonempty ||
          textBytes !== value.textBytes ||
          textBytes > Math.min(options.maxTextBytes, limits.textBytes as number)
        )
          return fail();
        controller.signal.throwIfAborted();
        return value as unknown as ExtractionResult;
      } catch (error) {
        if (controller.signal.aborted) throw controller.signal.reason;
        if (error instanceof ExtractionServiceError) throw error;
        return fail('UNAVAILABLE');
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', cancel);
      }
    },
  };
}

export async function readExtractionInput(
  file: Express.Multer.File,
  extractor: DocumentExtractor,
  signal?: AbortSignal,
): Promise<Buffer> {
  if (file.buffer) {
    if (!file.buffer.length || file.buffer.length > extractor.maxInputBytes)
      return fail('INPUT_LIMIT');
    return file.buffer;
  }
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of createReadStream(file.path, { signal })) {
      const bytes = chunk as Buffer;
      size += bytes.length;
      if (size > extractor.maxInputBytes) return fail('INPUT_LIMIT');
      chunks.push(bytes);
    }
    if (!size) return fail('INPUT_LIMIT');
    return Buffer.concat(chunks, size);
  } catch (error) {
    if (error instanceof ExtractionServiceError) throw error;
    return fail(signal?.aborted ? 'CANCELLED' : 'INPUT_UNAVAILABLE');
  }
}

/** Flatten only at an existing plain-text consumer boundary, never an HTML preview boundary. */
export function extractionText(result: ExtractionResult): string {
  return result.segments.map((segment) => segment.text).join('\n');
}
