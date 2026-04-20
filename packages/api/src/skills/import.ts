import crypto from 'crypto';
import path from 'path';
import JSZip from 'jszip';
import { ResourceType, AccessRoleIds, PrincipalType } from 'librechat-data-provider';
import { logger } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { Types } from 'mongoose';
import type {
  ISkill,
  ISkillFile,
  CreateSkillInput,
  CreateSkillResult,
  UpsertSkillFileInput,
} from '@librechat/data-schemas';

/** Security limits for zip processing. */
const MAX_ZIP_BYTES = 50 * 1024 * 1024; // 50 MB compressed
const MAX_DECOMPRESSED_BYTES = 500 * 1024 * 1024; // 500 MB total decompressed
const MAX_ENTRIES = 500;
const MAX_SINGLE_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file
const SKILL_MD = 'SKILL.md';

/** Strip surrounding YAML quotes (single or double) from a scalar value. */
function unquoteYaml(value: string): string {
  if (
    value.length >= 2 &&
    ((value[0] === '"' && value[value.length - 1] === '"') ||
      (value[0] === "'" && value[value.length - 1] === "'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Strip a trailing YAML inline comment from an unquoted scalar.
 * YAML treats ` # ...` (space before hash) as a comment; `#` without a
 * preceding space is part of the value. A scalar that's entirely a
 * comment (`# nothing here`) collapses to empty so callers can treat
 * it as "no value". Applied only to boolean tokens here since those are
 * single-word and comment-safe; free-form scalars like descriptions
 * might legitimately contain `#`.
 */
function stripYamlTrailingComment(value: string): string {
  if (value.trimStart().startsWith('#')) return '';
  const match = value.match(/^(.*?)\s+#.*$/);
  return match ? match[1] : value;
}

/** Parse a YAML scalar as a strict boolean. Returns `undefined` when neither. */
function parseBooleanScalar(value: string): boolean | undefined {
  const lowered = stripYamlTrailingComment(value).trim().toLowerCase();
  if (lowered === 'true') {
    return true;
  }
  if (lowered === 'false') {
    return false;
  }
  return undefined;
}

/**
 * YAML frontmatter parser — extracts the first-class fields LibreChat
 * persists as columns (`name`, `description`, `alwaysApply`) out of a
 * SKILL.md file. Intentionally narrow: the full frontmatter validator in
 * `packages/data-schemas/src/methods/skill.ts` covers the wire contract;
 * this parser only needs to hand `createSkill` the columns it populates.
 *
 * When a known boolean field (currently just `always-apply`) is present
 * with a value that isn't recognizable as `true`/`false`, the parser
 * records it on `invalidBooleans[]` so the import handler can surface
 * a 400 instead of silently dropping the flag. Without this signal,
 * authoring mistakes like `always-apply: yes` would be lossy-converted
 * to "not always-applied" and the user would never learn their
 * frontmatter was malformed.
 *
 * Exported for unit testing only — prefer `createImportHandler` at runtime.
 */
export function parseFrontmatter(raw: string): {
  name: string;
  description: string;
  alwaysApply?: boolean;
  /** Keys that carried non-boolean values for fields that must be boolean. */
  invalidBooleans: string[];
} {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('---')) {
    return { name: '', description: '', invalidBooleans: [] };
  }
  const after = trimmed.slice(3);
  const closingIdx = after.indexOf('\n---');
  if (closingIdx === -1) {
    return { name: '', description: '', invalidBooleans: [] };
  }
  const block = after.slice(0, closingIdx);
  let name = '';
  let description = '';
  let alwaysApply: boolean | undefined;
  const invalidBooleans: string[] = [];
  for (const line of block.split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) {
      continue;
    }
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = unquoteYaml(line.slice(colon + 1).trim());
    if (key === 'name') {
      name = value;
    } else if (key === 'description') {
      description = value;
    } else if (key === 'always-apply') {
      // The outer `value` was already run through `unquoteYaml`, which
      // only handles whole-line quoting. For `always-apply: "true" # note`
      // the quote check misses (line doesn't end with a quote), so strip
      // the comment first and then unquote the remainder.
      const stripped = stripYamlTrailingComment(value).trim();
      if (stripped === '') {
        // Empty value or comment-only (`always-apply: # TBD`) — treat as
        // absent so mid-edit placeholder states don't reject the save.
        continue;
      }
      const parsed = parseBooleanScalar(unquoteYaml(stripped));
      if (parsed === undefined) {
        invalidBooleans.push(key);
      } else {
        alwaysApply = parsed;
      }
    }
  }
  return { name, description, alwaysApply, invalidBooleans };
}

/** Validates a relative path is safe (no traversal, no absolute paths). */
function isSafePath(p: string): boolean {
  if (!p || p.startsWith('/') || p.startsWith('\\')) {
    return false;
  }
  const segments = p.split('/');
  for (const seg of segments) {
    if (seg === '..' || seg === '.' || seg === '') {
      return false;
    }
  }
  return /^[a-zA-Z0-9._\-/]+$/.test(p);
}

/** Type guard for validation errors thrown by data-schemas. */
function isValidationError(error: unknown): error is Error & { code: string; issues: unknown[] } {
  return (
    error instanceof Error &&
    (error as Error & { code?: string }).code === 'SKILL_VALIDATION_FAILED'
  );
}

/** Type guard for MongoDB duplicate key errors. */
function isDuplicateKeyError(error: unknown): boolean {
  return (
    error != null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code: unknown }).code === 11000
  );
}

export interface ImportSkillDeps {
  createSkill: (data: CreateSkillInput) => Promise<CreateSkillResult>;
  getSkillById: (id: string | Types.ObjectId) => Promise<(ISkill & { _id: Types.ObjectId }) | null>;
  deleteSkill: (id: string) => Promise<{ deleted: boolean }>;
  upsertSkillFile: (row: UpsertSkillFileInput) => Promise<ISkillFile & { _id: Types.ObjectId }>;
  saveBuffer: (
    req: Request,
    params: {
      userId: string;
      buffer: Buffer;
      fileName: string;
      basePath?: string;
      isImage?: boolean;
    },
  ) => Promise<{ filepath: string; source: string }>;
  deleteFile?: (
    req: Request,
    file: { filepath: string; source: string; [key: string]: unknown },
  ) => Promise<void>;
  grantPermission: (params: {
    principalType: string;
    principalId: string;
    resourceType: string;
    resourceId: Types.ObjectId;
    accessRoleId: string;
    grantedBy: string;
  }) => Promise<unknown>;
}

interface ServerRequest extends Request {
  user: {
    id: string;
    _id: Types.ObjectId;
    name?: string;
    username?: string;
    tenantId?: string;
  };
  file?: Express.Multer.File;
}

/**
 * `POST /api/skills/import`
 *
 * Accepts a single multipart file (.md, .zip, or .skill).
 * Creates the skill, then processes additional files individually.
 * Grants SKILL_OWNER to the uploader.
 */
export function createImportHandler(deps: ImportSkillDeps) {
  return async function importSkillHandler(req: ServerRequest, res: Response) {
    const { file } = req;
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const ext = path.extname(file.originalname).toLowerCase();

    try {
      if (ext === '.md') {
        return await handleMarkdown(req, res, deps, file);
      }
      if (ext === '.zip' || ext === '.skill') {
        return await handleZip(req, res, deps, file);
      }
      return res.status(400).json({ error: `Unsupported file type: ${ext}` });
    } catch (error) {
      // Surface validation errors as 400 instead of generic 500
      if (isValidationError(error)) {
        return res.status(400).json({
          error: 'Validation failed',
          issues: error.issues,
          message: (error.issues as Array<{ message?: string }>)?.map((i) => i.message).join('; '),
        });
      }
      if (isDuplicateKeyError(error)) {
        return res.status(409).json({ error: 'A skill with this name already exists' });
      }
      logger.error('[importSkill] Unhandled error:', error);
      return res.status(500).json({ error: 'Failed to import skill' });
    }
  };
}

/** Resolve author metadata from the request user. */
function getAuthorInfo(req: ServerRequest) {
  const user = req.user;
  const authorId = (user._id ?? user.id) as unknown as Types.ObjectId;
  const authorName = user.name ?? user.username ?? 'Unknown';
  const tenantId = user.tenantId;
  return { authorId, authorName, tenantId };
}

/** Grant SKILL_OWNER permission to the uploader. Rolls back skill on failure. */
async function grantOwnership(
  deps: ImportSkillDeps,
  userId: string,
  skillId: Types.ObjectId,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await deps.grantPermission({
      principalType: PrincipalType.USER,
      principalId: userId,
      resourceType: ResourceType.SKILL,
      resourceId: skillId,
      accessRoleId: AccessRoleIds.SKILL_OWNER,
      grantedBy: userId,
    });
    return { ok: true };
  } catch (error) {
    logger.error(`[importSkill] Failed to grant SKILL_OWNER for ${skillId}, rolling back:`, error);
    try {
      await deps.deleteSkill(skillId.toString());
    } catch (rollbackError) {
      logger.error(`[importSkill] Compensating delete failed for ${skillId}:`, rollbackError);
    }
    return { ok: false, error: 'Failed to initialize skill permissions' };
  }
}

async function handleMarkdown(
  req: ServerRequest,
  res: Response,
  deps: ImportSkillDeps,
  file: Express.Multer.File,
) {
  const content = file.buffer.toString('utf-8');

  const { name, description, alwaysApply, invalidBooleans } = parseFrontmatter(content);
  if (invalidBooleans.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      issues: invalidBooleans.map((key) => ({
        field: `frontmatter.${key}`,
        code: 'INVALID_TYPE',
        message: `"${key}" must be a boolean (true or false)`,
      })),
    });
  }
  const inferredName =
    name ||
    file.originalname
      .replace(/\.md$/i, '')
      .replace(/[^a-z0-9-]/gi, '-')
      .replace(/^-+/, '')
      .toLowerCase();
  if (!inferredName) {
    return res
      .status(400)
      .json({ error: 'Could not determine skill name from file or frontmatter' });
  }

  const { authorId, authorName, tenantId } = getAuthorInfo(req);

  const result = await deps.createSkill({
    name: inferredName,
    description: description || inferredName,
    body: content,
    author: authorId,
    authorName,
    alwaysApply,
    tenantId,
  });

  const skill = result.skill as ISkill & { _id: Types.ObjectId };
  const grant = await grantOwnership(deps, req.user.id, skill._id);
  if (!grant.ok) {
    return res.status(500).json({ error: grant.error });
  }

  return res.status(201).json(skill);
}

async function handleZip(
  req: ServerRequest,
  res: Response,
  deps: ImportSkillDeps,
  file: Express.Multer.File,
) {
  const userId = req.user.id;

  const zipBuffer = file.buffer;

  if (zipBuffer.length > MAX_ZIP_BYTES) {
    return res.status(400).json({ error: `File too large (max ${MAX_ZIP_BYTES / 1024 / 1024}MB)` });
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch {
    return res.status(400).json({ error: 'Invalid or corrupt archive' });
  }
  const entries = Object.keys(zip.files);

  if (entries.length > MAX_ENTRIES) {
    return res.status(400).json({ error: `Too many files in archive (max ${MAX_ENTRIES})` });
  }

  // Find SKILL.md — at root or one level deep
  let skillMdPath: string | null = null;
  let prefix = '';
  for (const p of entries) {
    const normalized = p.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);
    const basename = segments[segments.length - 1];
    if (basename?.toUpperCase() === SKILL_MD.toUpperCase() && segments.length <= 2) {
      skillMdPath = p;
      if (segments.length === 2) {
        prefix = segments[0] + '/';
      }
      break;
    }
  }

  if (!skillMdPath) {
    return res.status(400).json({ error: 'Archive must contain a SKILL.md file' });
  }

  const skillMdEntry = zip.file(skillMdPath);
  const declaredSize =
    (skillMdEntry as unknown as { _data?: { uncompressedSize?: number } })?._data
      ?.uncompressedSize ?? 0;
  if (declaredSize > MAX_SINGLE_FILE_BYTES) {
    return res
      .status(400)
      .json({ error: `SKILL.md too large (${Math.round(declaredSize / 1024 / 1024)}MB)` });
  }
  const skillMdContent = await skillMdEntry?.async('string');
  if (!skillMdContent) {
    return res.status(400).json({ error: 'Could not read SKILL.md from archive' });
  }
  if (Buffer.byteLength(skillMdContent, 'utf-8') > MAX_SINGLE_FILE_BYTES) {
    return res.status(400).json({ error: 'SKILL.md exceeds maximum file size' });
  }

  const { name, description, alwaysApply, invalidBooleans } = parseFrontmatter(skillMdContent);
  if (invalidBooleans.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      issues: invalidBooleans.map((key) => ({
        field: `frontmatter.${key}`,
        code: 'INVALID_TYPE',
        message: `"${key}" must be a boolean (true or false)`,
      })),
    });
  }
  const inferredName =
    name ||
    file.originalname
      .replace(/\.(zip|skill)$/i, '')
      .replace(/[^a-z0-9-]/gi, '-')
      .replace(/^-+/, '')
      .toLowerCase();

  if (!inferredName) {
    return res.status(400).json({ error: 'Could not determine skill name' });
  }

  const { authorId, authorName, tenantId } = getAuthorInfo(req);

  // Create the skill (runs full validation: name pattern, description length, etc.)
  const result = await deps.createSkill({
    name: inferredName,
    description: description || inferredName,
    body: skillMdContent,
    author: authorId,
    authorName,
    alwaysApply,
    tenantId,
  });

  const skill = result.skill as ISkill & { _id: Types.ObjectId };

  // Grant ownership — rolls back skill on failure
  const grant = await grantOwnership(deps, userId, skill._id);
  if (!grant.ok) {
    return res.status(500).json({ error: grant.error });
  }

  // Process additional files (everything except SKILL.md)
  const fileResults: Array<{ path: string; status: 'ok' | 'error'; error?: string }> = [];
  let totalDecompressed = 0;

  for (const [entryPath, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) {
      continue;
    }
    const normalized = entryPath.replace(/\\/g, '/');

    // Strip the prefix if SKILL.md was inside a folder
    const relativePath =
      prefix && normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;

    // Skip SKILL.md (already used as body)
    if (relativePath.toUpperCase() === SKILL_MD.toUpperCase()) {
      continue;
    }

    if (!relativePath || !isSafePath(relativePath)) {
      fileResults.push({ path: normalized, status: 'error', error: 'Invalid path' });
      continue;
    }

    try {
      // Stream-decompress with hard byte cap. JSZip's nodeStream decompresses
      // incrementally so we can abort mid-entry without buffering the full file.
      const perFileLimit = MAX_SINGLE_FILE_BYTES;
      const cumulativeLimit = MAX_DECOMPRESSED_BYTES - totalDecompressed;
      const effectiveLimit = Math.min(perFileLimit, cumulativeLimit);

      if (effectiveLimit <= 0) {
        fileResults.push({
          path: relativePath,
          status: 'error',
          error: 'Cumulative decompressed size exceeds limit',
        });
        break;
      }

      // Stream-decompress with enforced byte limit
      const chunks: Buffer[] = [];
      let entryBytes = 0;
      let exceededLimit = false;
      const entryStream = zipEntry.nodeStream('nodebuffer');

      await new Promise<void>((resolve, reject) => {
        entryStream.on('data', (chunk: Buffer) => {
          entryBytes += chunk.length;
          if (entryBytes > effectiveLimit) {
            exceededLimit = true;
            if ('destroy' in entryStream && typeof entryStream.destroy === 'function') {
              entryStream.destroy();
            }
            resolve();
            return;
          }
          chunks.push(chunk);
        });
        entryStream.on('end', resolve);
        entryStream.on('error', reject);
      });

      if (exceededLimit) {
        const reason =
          entryBytes > perFileLimit
            ? `File too large (max ${perFileLimit / 1024 / 1024}MB)`
            : 'Cumulative decompressed size exceeds limit';
        fileResults.push({ path: relativePath, status: 'error', error: reason });
        if (entryBytes > cumulativeLimit) {
          break;
        }
        continue;
      }

      const fileBuffer = Buffer.concat(chunks);
      totalDecompressed += fileBuffer.length;

      const fileId = crypto.randomUUID();
      const filename = path.basename(relativePath);
      const storageFileName = `${fileId}__${filename}`;

      const mimeType = guessMimeType(filename);

      // Save to file storage (strategy-aware)
      const { filepath, source } = await deps.saveBuffer(req, {
        userId,
        buffer: fileBuffer,
        fileName: storageFileName,
        basePath: 'uploads',
        isImage: mimeType.startsWith('image/'),
      });

      // Upsert the SkillFile DB record (runs path validation internally).
      // If the DB write fails, clean up the stored blob to prevent orphans.
      try {
        await deps.upsertSkillFile({
          skillId: skill._id,
          relativePath,
          file_id: fileId,
          filename,
          filepath,
          source,
          mimeType,
          bytes: fileBuffer.length,
          isExecutable: false,
          author: authorId,
          tenantId,
        });
      } catch (dbError) {
        if (deps.deleteFile) {
          await deps
            .deleteFile(req, { filepath, source })
            .catch((e) =>
              logger.error(`[importSkill] Orphan cleanup failed for ${relativePath}:`, e),
            );
        }
        throw dbError;
      }

      fileResults.push({ path: relativePath, status: 'ok' });
    } catch (error) {
      logger.error(`[importSkill] Failed to process file ${relativePath}:`, error);
      fileResults.push({
        path: relativePath,
        status: 'error',
        error: (error as Error).message,
      });
    }
  }

  const errors: typeof fileResults = [];
  let successCount = 0;
  for (const r of fileResults) {
    if (r.status === 'ok') {
      successCount++;
    } else {
      errors.push(r);
    }
  }

  logger.info(
    `[importSkill] Imported skill "${inferredName}" with ${successCount} files (${errors.length} errors)`,
  );

  // Re-read the skill to get the current version/fileCount (bumped by each upsertSkillFile)
  const refreshed = (await deps.getSkillById(skill._id)) ?? skill;

  return res.status(201).json({
    ...refreshed,
    _importSummary: {
      filesProcessed: fileResults.length,
      filesSucceeded: successCount,
      filesFailed: errors.length,
      errors,
    },
  });
}

const MIME_MAP: Record<string, string> = {
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.js': 'application/javascript',
  '.ts': 'text/typescript',
  '.jsx': 'text/jsx',
  '.tsx': 'text/tsx',
  '.json': 'application/json',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.py': 'text/x-python',
  '.sh': 'application/x-sh',
  '.css': 'text/css',
  '.html': 'text/html',
  '.xml': 'application/xml',
  '.csv': 'text/csv',
  '.toml': 'text/toml',
  '.ini': 'text/ini',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

function guessMimeType(filename: string): string {
  return MIME_MAP[path.extname(filename).toLowerCase()] || 'application/octet-stream';
}
