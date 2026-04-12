import crypto from 'crypto';
import path from 'path';
import JSZip from 'jszip';
import { FileSources } from 'librechat-data-provider';
import { logger } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { Types } from 'mongoose';
import type {
  ISkill,
  ISkillFile,
  CreateSkillResult,
  UpsertSkillFileInput,
} from '@librechat/data-schemas';

/** Security limits for zip processing. */
const MAX_ZIP_BYTES = 50 * 1024 * 1024; // 50 MB compressed
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

export interface ImportSkillDeps {
  createSkill: (data: {
    name: string;
    description: string;
    body: string;
    author: Types.ObjectId;
    tenantId?: string;
  }) => Promise<CreateSkillResult>;
  upsertSkillFile: (row: UpsertSkillFileInput) => Promise<ISkillFile & { _id: Types.ObjectId }>;
  saveBuffer: (params: {
    userId: string;
    buffer: Buffer;
    fileName: string;
    basePath?: string;
  }) => Promise<string>;
}

interface ServerRequest extends Request {
  user: { id: string; _id: Types.ObjectId };
  file?: Express.Multer.File;
  file_id?: string;
}

/**
 * `POST /api/skills/import`
 *
 * Accepts a single multipart file (.md, .zip, or .skill).
 *
 * - `.md`: parses frontmatter, creates a skill with the full file as body.
 * - `.zip` / `.skill`: extracts the archive, finds SKILL.md, creates the
 *   skill, then persists every additional file via `upsertSkillFile` +
 *   the configured file storage strategy.
 *
 * Returns the created skill on success.
 */
export function createImportHandler(deps: ImportSkillDeps) {
  return async function importSkillHandler(req: ServerRequest, res: Response) {
    const { file } = req;
    if (!file) {
      return res.status(400).json({ message: 'No file provided' });
    }

    const ext = path.extname(file.originalname).toLowerCase();
    const userId = req.user.id;

    try {
      if (ext === '.md') {
        return await handleMarkdown(req, res, deps, file, userId);
      }
      if (ext === '.zip' || ext === '.skill') {
        return await handleZip(req, res, deps, file, userId);
      }
      return res.status(400).json({ message: `Unsupported file type: ${ext}` });
    } catch (error) {
      logger.error('[importSkill] Unhandled error:', error);
      return res.status(500).json({ message: 'Failed to import skill' });
    }
  };
}

async function handleMarkdown(
  req: ServerRequest,
  res: Response,
  deps: ImportSkillDeps,
  file: Express.Multer.File,
  userId: string,
) {
  const content = file.buffer
    ? file.buffer.toString('utf-8')
    : await import('fs').then((fs) => fs.promises.readFile(file.path, 'utf-8'));

  const { name, description } = parseFrontmatter(content);
  if (!name) {
    return res.status(400).json({ message: 'SKILL.md must have a name in YAML frontmatter' });
  }

  const result = await deps.createSkill({
    name,
    description: description || name,
    body: content,
    author: req.user._id,
  });

  return res.status(201).json(result.skill);
}

async function handleZip(
  req: ServerRequest,
  res: Response,
  deps: ImportSkillDeps,
  file: Express.Multer.File,
  userId: string,
) {
  // Read the zip buffer
  const zipBuffer = file.buffer
    ? file.buffer
    : await import('fs').then((fs) => fs.promises.readFile(file.path));

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
    if (!isSafePath(normalized) && normalized !== SKILL_MD) {
      continue;
    }
    const segments = normalized.split('/').filter(Boolean);
    const basename = segments[segments.length - 1];
    if (basename?.toUpperCase() === SKILL_MD.toUpperCase() && segments.length <= 2) {
      skillMdPath = p;
      // If SKILL.md is inside a folder (e.g. my-skill/SKILL.md), strip the prefix
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

  // Create the skill
  const result = await deps.createSkill({
    name: inferredName,
    description: description || inferredName,
    body: skillMdContent,
    author: req.user._id,
  });

  const skill = result.skill as ISkill & { _id: Types.ObjectId };

  // Process additional files (everything except SKILL.md)
  const fileResults: Array<{ path: string; status: 'ok' | 'error'; error?: string }> = [];

  for (const [entryPath, zipEntry] of Object.entries(zip.files)) {
    // Skip directories, SKILL.md itself, and unsafe paths
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
      const fileBuffer = await zipEntry.async('nodebuffer');

      // Per-file size guard
      if (fileBuffer.length > MAX_SINGLE_FILE_BYTES) {
        fileResults.push({
          path: relativePath,
          status: 'error',
          error: `File too large (max ${MAX_SINGLE_FILE_BYTES / 1024 / 1024}MB)`,
        });
        continue;
      }

      // Generate a unique file_id for storage
      const fileId = crypto.randomUUID();
      const filename = path.basename(relativePath);
      const storageFileName = `${fileId}__${filename}`;

      // Save to file storage (local/S3/etc.)
      const filepath = await deps.saveBuffer({
        userId,
        buffer: fileBuffer,
        fileName: storageFileName,
        basePath: 'uploads',
      });

      // Detect MIME type from extension
      const mimeType = guessMimeType(filename);

      // Upsert the SkillFile record
      await deps.upsertSkillFile({
        skillId: skill._id,
        relativePath,
        file_id: fileId,
        filename,
        filepath,
        source: FileSources.local,
        mimeType,
        bytes: fileBuffer.length,
        isExecutable: false,
        author: req.user._id,
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

  const successCount = fileResults.filter((r) => r.status === 'ok').length;
  const errorCount = fileResults.filter((r) => r.status === 'error').length;

  logger.info(
    `[importSkill] Imported skill "${inferredName}" with ${successCount} files (${errorCount} errors)`,
  );

  return res.status(201).json({
    ...result.skill,
    _importSummary: {
      filesProcessed: fileResults.length,
      filesSucceeded: successCount,
      filesFailed: errorCount,
      errors: fileResults.filter((r) => r.status === 'error'),
    },
  });
}

/** Guess MIME type from file extension. */
function guessMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
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
  return map[ext] || 'application/octet-stream';
}
