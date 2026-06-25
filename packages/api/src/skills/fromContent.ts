import { logger } from '@librechat/data-schemas';
import type { ISkill } from '@librechat/data-schemas';
import type { Types } from 'mongoose';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';
import type { CreateSkillFromMarkdownDeps } from './import';
import { isValidationError, isDuplicateKeyError, createSkillFromMarkdown } from './import';
import { MAX_SKILL_MARKDOWN_BYTES } from './fromFile';

interface CreateFromContentBody {
  content?: string;
  name?: string;
  description?: string;
}

/**
 * Build the typed handler for the in-chat "save as skill" banner's
 * content-based path. Unlike `from-file`, the SKILL.md never lands in storage
 * as a file — the assistant emits it as a LibreChat artifact inside the message
 * content, so the client parses the markdown out and posts it directly. No
 * `getFiles`/storage deps are needed; only the create + grant surface.
 */
export function createSkillFromContentHandler(deps: CreateSkillFromMarkdownDeps) {
  /**
   * `POST /api/skills/from-content` with `{ content, name?, description? }`.
   * Validates the body is non-empty markdown within the size cap, then creates
   * the skill (honoring the edited name/description from the banner).
   */
  async function createFromContent(req: ServerRequest, res: Response) {
    try {
      const body = (req.body ?? {}) as CreateFromContentBody;
      const { content, name, description } = body;

      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ error: 'content is required' });
      }
      if (Buffer.byteLength(content, 'utf-8') > MAX_SKILL_MARKDOWN_BYTES) {
        return res.status(400).json({ error: 'Skill content exceeds maximum size' });
      }

      const result = await createSkillFromMarkdown(deps, req, {
        content,
        originalname: 'SKILL.md',
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
      logger.error('[POST /skills/from-content] Error', error);
      return res.status(500).json({ error: 'Failed to create skill from content' });
    }
  }

  return { createFromContent };
}

export type SkillFromContentHandlers = ReturnType<typeof createSkillFromContentHandler>;
