/**
 * Host-side bridge that lets the model write generated/attached binary files
 * (xlsx, pdf, png, docx, …) to upload-style MCP tools (e.g. Google Drive's
 * `create_file`) WITHOUT carrying the bytes through the model.
 *
 * Convention: instead of pasting base64, the model references a file by id or
 * name using an `@file:<ref>` placeholder in a content argument. Before the
 * MCP call is dispatched, the host resolves that placeholder to real base64
 * content fetched from storage and (when the tool exposes it) fills in the
 * matching mime-type argument.
 *
 * This module is the pure, dependency-injected core: it takes a `resolveFile`
 * function and never touches storage directly, so it is fully unit-testable
 * and safe to call in the hot tool-execution path (any failure leaves the
 * arguments untouched).
 */

export interface ResolvedFileContent {
  base64: string;
  mimeType?: string;
}

/** Resolves an `@file:<ref>` reference to its bytes, or null if not found. */
export type FileResolver = (ref: string) => Promise<ResolvedFileContent | null>;

const FILE_REF_PREFIX = '@file:';

/**
 * Argument keys that upload-style MCP tools use for raw (binary) content. A
 * resolved file's base64 lands here. `content` is included because some tools
 * (Google Drive) document it as "always base64 encoded".
 */
const BASE64_CONTENT_KEYS = new Set(['base64Content', 'base64_content', 'content']);

/** Sibling keys that carry the content's mime type, filled in when empty. */
const MIME_TYPE_KEYS = ['contentMimeType', 'content_mime_type', 'mimeType', 'mime_type'];

const isFileRef = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith(FILE_REF_PREFIX) && value.length > FILE_REF_PREFIX.length;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Rewrites `@file:<ref>` placeholders in an MCP tool's arguments to real base64
 * content. Returns the original object reference unchanged when there is
 * nothing to resolve, the tool is not an MCP tool, or no placeholder resolves.
 */
export async function transformMCPToolArguments(params: {
  isMCPTool: boolean;
  args: unknown;
  resolveFile: FileResolver;
}): Promise<unknown> {
  const { isMCPTool, args, resolveFile } = params;
  if (!isMCPTool || !isPlainObject(args)) {
    return args;
  }

  const refKeys = Object.keys(args).filter((key) => isFileRef(args[key]));
  if (refKeys.length === 0) {
    return args;
  }

  const next: Record<string, unknown> = { ...args };
  let changed = false;

  for (const key of refKeys) {
    const ref = (args[key] as string).slice(FILE_REF_PREFIX.length).trim();
    const resolved = await resolveFile(ref);
    if (!resolved) {
      continue;
    }

    // For non-base64 content keys (e.g. textContent), move the bytes onto a
    // dedicated base64 field so the tool treats them as binary.
    if (BASE64_CONTENT_KEYS.has(key)) {
      next[key] = resolved.base64;
    } else {
      next.base64Content = resolved.base64;
      delete next[key];
    }
    changed = true;

    if (resolved.mimeType) {
      const mimeKey = MIME_TYPE_KEYS.find((k) => k in next);
      const targetMimeKey = mimeKey ?? 'contentMimeType';
      const existing = next[targetMimeKey];
      if (existing == null || existing === '') {
        next[targetMimeKey] = resolved.mimeType;
      }
    }
  }

  return changed ? next : args;
}
