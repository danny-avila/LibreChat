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

/** YAML frontmatter parser — extracts name + description from SKILL.md. */
function parseFrontmatter(raw: string): { name: string; description: string } {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('---')) {
    return { name: '', description: '' };
  }
  const after = trimmed.slice(3);
  const closingIdx = after.indexOf('\n---');
  if (closingIdx === -1) {
    return { name: '', description: '' };
  }
  const block = after.slice(0, closingIdx);
  let name = '';
  let description = '';
  for (const line of block.split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) {
      continue;
    }
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'name') {
      name = value;
    } else if (key === 'description') {
      description = value;
    }
  }
  return { name, description };
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
  grantPermission: (params: {
    principalType: string;
    principalId: string;
    resourceType: string;
    resourceId: Types.ObjectId;
    accessRoleId: string;
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
      return res.status(400).json({ message: 'No file provided' });
    }

    const ext = path.extname(file.originalname).toLowerCase();

    try {
      if (ext === '.md') {
        return await handleMarkdown(req, res, deps, file);
      }
      if (ext === '.zip' || ext === '.skill') {
        return await handleZip(req, res, deps, file);
      }
      return res.status(400).json({ message: `Unsupported file type: ${ext}` });
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
      return res.status(500).json({ message: 'Failed to import skill' });
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

  const { name, description } = parseFrontmatter(content);
  if (!name) {
    return res.status(400).json({ message: 'SKILL.md must have a name in YAML frontmatter' });
  }

  const { authorId, authorName, tenantId } = getAuthorInfo(req);

  const result = await deps.createSkill({
    name,
    description: description || name,
    body: content,
    author: authorId,
    authorName,
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
    return res
      .status(400)
      .json({ message: `File too large (max ${MAX_ZIP_BYTES / 1024 / 1024}MB)` });
  }

  const zip = await JSZip.loadAsync(zipBuffer);
  const entries = Object.keys(zip.files);

  if (entries.length > MAX_ENTRIES) {
    return res.status(400).json({ message: `Too many files in archive (max ${MAX_ENTRIES})` });
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
    return res.status(400).json({ message: 'Archive must contain a SKILL.md file' });
  }

  const skillMdContent = await zip.file(skillMdPath)?.async('string');
  if (!skillMdContent) {
    return res.status(400).json({ message: 'Could not read SKILL.md from archive' });
  }

  const { name, description } = parseFrontmatter(skillMdContent);
  const inferredName =
    name ||
    file.originalname
      .replace(/\.(zip|skill)$/i, '')
      .replace(/[^a-z0-9-]/gi, '-')
      .toLowerCase();

  if (!inferredName) {
    return res.status(400).json({ message: 'Could not determine skill name' });
  }

  const { authorId, authorName, tenantId } = getAuthorInfo(req);

  // Create the skill (runs full validation: name pattern, description length, etc.)
  const result = await deps.createSkill({
    name: inferredName,
    description: description || inferredName,
    body: skillMdContent,
    author: authorId,
    authorName,
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
      // Best-effort pre-decompression size check via undocumented JSZip internal.
      // Falls back to 0 when _data is absent — the post-decompression cumulative
      // check below is the real safety net.
      const declaredSize =
        (zipEntry as unknown as { _data?: { uncompressedSize?: number } })._data
          ?.uncompressedSize ?? 0;
      if (declaredSize > MAX_SINGLE_FILE_BYTES) {
        fileResults.push({
          path: relativePath,
          status: 'error',
          error: `Declared size too large (${Math.round(declaredSize / 1024 / 1024)}MB, max ${MAX_SINGLE_FILE_BYTES / 1024 / 1024}MB)`,
        });
        continue;
      }
      if (totalDecompressed + declaredSize > MAX_DECOMPRESSED_BYTES) {
        fileResults.push({
          path: relativePath,
          status: 'error',
          error: 'Cumulative decompressed size exceeds limit',
        });
        continue;
      }

      const fileBuffer = await zipEntry.async('nodebuffer');
      totalDecompressed += fileBuffer.length;

      if (totalDecompressed > MAX_DECOMPRESSED_BYTES) {
        fileResults.push({
          path: relativePath,
          status: 'error',
          error: 'Cumulative decompressed size exceeds limit',
        });
        break;
      }

      if (fileBuffer.length > MAX_SINGLE_FILE_BYTES) {
        fileResults.push({
          path: relativePath,
          status: 'error',
          error: `File too large (max ${MAX_SINGLE_FILE_BYTES / 1024 / 1024}MB)`,
        });
        continue;
      }

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

      // Upsert the SkillFile DB record (runs path validation internally)
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

  return res.status(201).json({
    ...skill,
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
