import { logger } from '@librechat/data-schemas';
import type { IMongoFile, ISkill } from '@librechat/data-schemas';
import type { FilterQuery, Types } from 'mongoose';
import type { Response } from 'express';
import type { ServerRequest, StrategyFunctions } from '~/types';
import type { CreateSkillFromMarkdownDeps } from './import';
import {
  parseFrontmatter,
  isValidationError,
  isDuplicateKeyError,
  createSkillFromMarkdown,
} from './import';

/**
 * Markdown bodies are tiny; cap reads so a mislabeled large file can't be
 * buffered into memory. Mirrors the size-cap sense of `MAX_BINARY_BYTES`.
 */
export const MAX_SKILL_MARKDOWN_BYTES = 1 * 1024 * 1024;

/** Matches a SKILL.md filename regardless of case. */
const SKILL_MD_PATTERN = /^skill\.md$/i;

type GetFiles = (filter: FilterQuery<IMongoFile>) => Promise<IMongoFile[] | null>;
type GetStrategyFunctions = (source: string) => Partial<StrategyFunctions>;

export interface SkillFromFileDeps extends CreateSkillFromMarkdownDeps {
  getFiles: GetFiles;
  getStrategyFunctions: GetStrategyFunctions;
}

interface SkillFileAssessment {
  isSkill: boolean;
  name: string;
  description: string;
}

/** A markdown file is a skill if it's named SKILL.md or carries name+description frontmatter. */
function assessSkillContent(filename: string, content: string): SkillFileAssessment {
  const { name, description } = parseFrontmatter(content);
  const hasFrontmatter = name.length > 0 && description.length > 0;
  const isSkill = SKILL_MD_PATTERN.test(filename) || hasFrontmatter;
  return { isSkill, name, description };
}

/** Read a stored file's text content (utf-8) with a hard byte cap. */
async function readFileText(
  file: IMongoFile,
  req: ServerRequest,
  getStrategyFunctions: GetStrategyFunctions,
): Promise<string> {
  const strategy = getStrategyFunctions(file.source);
  if (!strategy.getDownloadStream) {
    throw new Error(`Download not supported for storage backend "${file.source}"`);
  }
  const stream = await strategy.getDownloadStream(req, file.filepath);
  const chunks: Buffer[] = [];
  let streamedBytes = 0;
  for await (const raw of stream as AsyncIterable<Uint8Array>) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    streamedBytes += chunk.byteLength;
    if (streamedBytes > MAX_SKILL_MARKDOWN_BYTES) {
      if ('destroy' in stream && typeof (stream as { destroy?: () => void }).destroy === 'function') {
        (stream as { destroy: () => void }).destroy();
      }
      throw new Error(
        `File exceeded the ${MAX_SKILL_MARKDOWN_BYTES}-byte skill markdown limit and was not read.`,
      );
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/** Resolve the requesting user's id as a string for scoping the file lookup. */
function getUserId(req: ServerRequest): string {
  const user = req.user as { id?: string; _id?: { toString(): string } } | undefined;
  return user?.id ?? user?._id?.toString() ?? '';
}

/** Load a user-scoped file by id, returning `null` when not found / not owned. */
async function loadUserFile(
  deps: SkillFromFileDeps,
  req: ServerRequest,
  fileId: string,
): Promise<IMongoFile | null> {
  const userId = getUserId(req);
  const filter: FilterQuery<IMongoFile> = { file_id: fileId };
  if (userId) {
    filter.user = userId;
  }
  const files = (await deps.getFiles(filter)) ?? [];
  return files[0] ?? null;
}

/**
 * Build the typed HTTP handlers for the in-chat "save as skill" feature. Wired
 * by `api/server/routes/skills.js` with concrete `getFiles` + storage deps.
 */
export function createSkillFromFileHandlers(deps: SkillFromFileDeps) {
  /**
   * `GET /api/skills/file-preview?fileId=`
   * Non-mutating probe: is the referenced file a skill, and what name/description
   * would it produce? Never creates anything.
   */
  async function previewSkillFile(req: ServerRequest, res: Response) {
    try {
      const fileId = (req.query as { fileId?: string }).fileId;
      if (!fileId || typeof fileId !== 'string') {
        return res.status(400).json({ error: 'fileId is required' });
      }

      const file = await loadUserFile(deps, req, fileId);
      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      const content = await readFileText(file, req, deps.getStrategyFunctions);
      const { isSkill, name, description } = assessSkillContent(file.filename, content);
      return res.status(200).json({ isSkill, name, description });
    } catch (error) {
      logger.error('[GET /skills/file-preview] Error', error);
      return res.status(500).json({ error: 'Failed to preview skill file' });
    }
  }

  /**
   * `POST /api/skills/from-file` with `{ fileId, name?, description? }`.
   * Loads the user-scoped file, rejects non-skill markdown with 422, otherwise
   * creates the skill from its content (honoring name/description overrides).
   */
  async function createFromFile(req: ServerRequest, res: Response) {
    try {
      const body = (req.body ?? {}) as { fileId?: string; name?: string; description?: string };
      const { fileId, name, description } = body;
      if (!fileId || typeof fileId !== 'string') {
        return res.status(400).json({ error: 'fileId is required' });
      }

      const file = await loadUserFile(deps, req, fileId);
      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      const content = await readFileText(file, req, deps.getStrategyFunctions);
      const { isSkill } = assessSkillContent(file.filename, content);
      if (!isSkill) {
        return res.status(422).json({ error: 'This file is not a skill file' });
      }

      const result = await createSkillFromMarkdown(deps, req, {
        content,
        originalname: file.filename,
        nameOverride: name,
        descriptionOverride: description,
      });
      if (!result.ok) {
        return res.status(result.status).json(result.body);
      }
      return res.status(201).json(result.skill as ISkill & { _id: Types.ObjectId });
    } catch (error) {
      if (isValidationError(error)) {
        return res.status(400).json({ error: 'Validation failed', issues: error.issues });
      }
      if (isDuplicateKeyError(error)) {
        return res.status(409).json({ error: 'A skill with this name already exists' });
      }
      logger.error('[POST /skills/from-file] Error', error);
      return res.status(500).json({ error: 'Failed to create skill from file' });
    }
  }

  return { previewSkillFile, createFromFile };
}

export type SkillFromFileHandlers = ReturnType<typeof createSkillFromFileHandlers>;
