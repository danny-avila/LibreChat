import { Constants } from '@librechat/agents';
import type { IMongoFile } from '@librechat/data-schemas';
import type { FilterQuery } from 'mongoose';
import type { ServerRequest } from '~/types';
import { transformMCPToolArguments } from './transformMCPToolArguments';

/**
 * Hard cap on bytes streamed for a single file reference. Mirrors the
 * `MAX_BINARY_BYTES` ceiling used by the `read_file` handler so the two
 * binary-streaming paths agree on the largest payload they will buffer
 * into memory and base64-encode.
 */
export const MAX_BINARY_BYTES = 5 * 1024 * 1024;

/**
 * Convention token the model embeds in an MCP tool argument to reference an
 * existing conversation file by id. The host substitutes the file's real
 * base64 bytes before the MCP call is dispatched, so the model never has to
 * read raw binary into its context.
 *
 * Example: Google Drive `create_file` with `base64Content` set to
 * `@librechat-file:477d4f78-...`.
 */
export const FILE_TOKEN_PREFIX = '@librechat-file:';

/**
 * Matches `@librechat-file:<fileId>` where `<fileId>` is a uuid-ish id (hex
 * segments and hyphens). Global so embedded tokens can be replaced in place.
 */
const FILE_TOKEN_PATTERN = /@librechat-file:([0-9a-fA-F-]{8,})/g;

/** Max files listed in the convention note so a large turn can't blow the prompt. */
const MAX_NOTE_FILES = 25;

interface NoteFile {
  file_id: string;
  filename: string;
  type: string;
}

/**
 * Builds the system note that teaches the model the file-bridge convention so
 * it actually uses it instead of falling back to a text document. Lists the
 * turn's files as `id | filename | mimetype` when any are available, and
 * always states the `@librechat-file:<id>` instruction. Returns an empty
 * string when there are no files to reference (the model has nothing to
 * upload, so the note would be noise).
 */
export function buildFileBridgeNote(files: NoteFile[]): string {
  if (files.length === 0) {
    return '';
  }

  const listed = files.slice(0, MAX_NOTE_FILES);
  const lines = listed.map((f) => `- ${f.file_id} | ${f.filename} | ${f.type}`);
  const overflow =
    files.length > MAX_NOTE_FILES ? `\n- ...and ${files.length - MAX_NOTE_FILES} more` : '';

  return [
    '# Uploading files to storage/drive tools',
    'These files are available in this conversation:',
    `${lines.join('\n')}${overflow}`,
    'To upload an existing file to a storage/drive tool, pass `@librechat-file:<id>` ' +
      "as the tool's file content argument (e.g. Google Drive create_file `base64Content`), " +
      'and set the matching content mime type. Do not paste file bytes.',
  ].join('\n\n');
}

type GetFiles = (filter: FilterQuery<IMongoFile>) => Promise<IMongoFile[] | null>;

type StrategyFunctions = {
  getDownloadStream?: (req: ServerRequest, filepath: string) => Promise<NodeJS.ReadableStream>;
  [key: string]: unknown;
};

type GetStrategyFunctions = (source: string) => StrategyFunctions;

export interface ResolveFileReferencesParams {
  name: string;
  args: unknown;
  req?: ServerRequest;
  userId?: string;
  getFiles?: GetFiles;
  getStrategyFunctions?: GetStrategyFunctions;
}

export interface ResolveFileReferencesResult {
  args: unknown;
  resolved: string[];
}

interface ResolvedFile {
  base64: string;
  mimeType?: string;
}

const isErrorPlaceholder = (value: string): boolean => value.startsWith('[error:');

function collectFileIds(value: unknown, ids: Set<string>): void {
  if (typeof value === 'string') {
    FILE_TOKEN_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = FILE_TOKEN_PATTERN.exec(value)) !== null) {
      ids.add(match[1]);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectFileIds(item, ids);
    }
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) {
      collectFileIds(item, ids);
    }
  }
}

async function streamToBase64(
  file: IMongoFile,
  req: ServerRequest,
  getStrategyFunctions: GetStrategyFunctions,
): Promise<string> {
  const strategy = getStrategyFunctions(file.source);
  if (!strategy.getDownloadStream) {
    throw new Error(`Download not supported for storage backend "${file.source}"`);
  }

  const stream = await strategy.getDownloadStream(req, file.filepath);
  const chunks: Uint8Array[] = [];
  let streamedBytes = 0;
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    streamedBytes += chunk.byteLength;
    if (streamedBytes > MAX_BINARY_BYTES) {
      if (
        'destroy' in stream &&
        typeof (stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy === 'function'
      ) {
        (stream as NodeJS.ReadableStream & { destroy: () => void }).destroy();
      }
      throw new Error(`File exceeded the ${MAX_BINARY_BYTES}-byte upload limit and was not encoded.`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('base64');
}

async function resolveFile(
  id: string,
  file: IMongoFile | undefined,
  req: ServerRequest,
  getStrategyFunctions: GetStrategyFunctions,
): Promise<ResolvedFile | string> {
  if (!file) {
    return `[error: file "${id}" was not found or is not accessible — cannot attach its bytes]`;
  }
  if (typeof file.bytes === 'number' && file.bytes > MAX_BINARY_BYTES) {
    return `[error: file "${id}" is ${file.bytes} bytes, over the ${MAX_BINARY_BYTES}-byte upload limit]`;
  }
  try {
    const base64 = await streamToBase64(file, req, getStrategyFunctions);
    return { base64, mimeType: file.type };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `[error: failed to read file "${id}": ${message}]`;
  }
}

function substitute(value: unknown, replacements: Map<string, string>): unknown {
  if (typeof value === 'string') {
    if (!value.includes(FILE_TOKEN_PREFIX)) {
      return value;
    }
    return value.replace(FILE_TOKEN_PATTERN, (full, id: string) => replacements.get(id) ?? full);
  }
  if (Array.isArray(value)) {
    return value.map((item) => substitute(item, replacements));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = substitute(item, replacements);
    }
    return out;
  }
  return value;
}

/**
 * Substitutes `@librechat-file:<id>` tokens in an MCP tool's arguments with
 * the referenced file's base64 bytes so the model can upload existing binary
 * files (pdf, xlsx, docx, png) to storage tools like Google Drive
 * `create_file` without ever reading the raw bytes into its context.
 *
 * No-op for non-MCP tools or when dependencies are missing. Never throws on a
 * per-file failure — a missing/oversize/unreadable file becomes an inline
 * error string so the model sees the failure and the turn continues. The
 * input `args` object is never mutated; a fresh clone is returned only when a
 * substitution actually occurs.
 *
 * When the whole argument is a single resolvable token on a top-level object
 * key, `transformMCPToolArguments` additionally fills the matching mime-type
 * argument from the file record.
 */
export async function resolveFileReferences(
  params: ResolveFileReferencesParams,
): Promise<ResolveFileReferencesResult> {
  const { name, args, req, getFiles, getStrategyFunctions, userId } = params;

  if (!name.includes(Constants.mcp_delimiter) || !getFiles || !getStrategyFunctions || !req) {
    return { args, resolved: [] };
  }

  const ids = new Set<string>();
  collectFileIds(args, ids);
  if (ids.size === 0) {
    return { args, resolved: [] };
  }

  const filter: FilterQuery<IMongoFile> = { file_id: { $in: [...ids] } };
  if (userId) {
    filter.user = userId;
  }

  const files = (await getFiles(filter)) ?? [];
  const fileById = new Map<string, IMongoFile>();
  for (const file of files) {
    fileById.set(file.file_id, file);
  }

  const replacements = new Map<string, string>();
  const resolvedFiles = new Map<string, ResolvedFile>();
  const resolved: string[] = [];
  for (const id of ids) {
    const result = await resolveFile(id, fileById.get(id), req, getStrategyFunctions);
    if (typeof result === 'string') {
      replacements.set(id, result);
      continue;
    }
    replacements.set(id, result.base64);
    resolvedFiles.set(id, result);
    resolved.push(id);
  }

  const substituted = substitute(args, replacements);
  const enriched = await fillMimeTypes(substituted, args, resolvedFiles);

  return { args: enriched, resolved };
}

/**
 * Fills the sibling mime-type argument (e.g. Google Drive `contentMimeType`)
 * for any top-level object key whose entire value was a single resolved file
 * token. Delegates to the pure `transformMCPToolArguments` core so the
 * base64/mime-key conventions live in one place. No-op when nothing on the
 * top-level object was a single-token reference.
 */
async function fillMimeTypes(
  substituted: unknown,
  original: unknown,
  resolvedFiles: Map<string, ResolvedFile>,
): Promise<unknown> {
  if (
    resolvedFiles.size === 0 ||
    typeof substituted !== 'object' ||
    substituted === null ||
    Array.isArray(substituted) ||
    typeof original !== 'object' ||
    original === null
  ) {
    return substituted;
  }

  const refArgs: Record<string, string> = {};
  for (const [key, value] of Object.entries(original as Record<string, unknown>)) {
    if (typeof value !== 'string') {
      continue;
    }
    FILE_TOKEN_PATTERN.lastIndex = 0;
    const matches = [...value.matchAll(FILE_TOKEN_PATTERN)];
    if (matches.length === 1 && matches[0][0] === value.trim() && resolvedFiles.has(matches[0][1])) {
      refArgs[key] = `@file:${matches[0][1]}`;
    }
  }
  if (Object.keys(refArgs).length === 0) {
    return substituted;
  }

  return transformMCPToolArguments({
    isMCPTool: true,
    args: { ...(substituted as Record<string, unknown>), ...refArgs },
    resolveFile: async (ref) => resolvedFiles.get(ref) ?? null,
  });
}
