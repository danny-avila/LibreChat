import type { Document, Types } from 'mongoose';

/**
 * Skill — the single source of truth for a LibreChat skill.
 * Each document is the full SKILL.md body plus structured frontmatter and metadata.
 * The `version` field is an integer monotonic counter used for optimistic concurrency.
 */
export interface ISkill {
  /**
   * Machine-readable kebab-case identifier. This is what Claude sees in the
   * system-prompt skill manifest and what slash-command integrations key off.
   * Unique per `(author, tenantId)`. Must be stable across edits — a rename
   * invalidates any external reference to the skill.
   */
  name: string;
  /**
   * Human-readable label shown only in the LibreChat UI (skill list, detail
   * header, sharing dialogs). NOT sent to Claude and NOT part of the trigger
   * path — `name` + `description` drive triggering. Purely cosmetic: lets an
   * author keep a stable kebab-case `name` while showing something prettier
   * in the UI.
   */
  displayTitle?: string;
  /**
   * "When to use this skill" sentence. This is the highest-leverage field for
   * Claude's triggering decision — vague or missing descriptions cause
   * undertriggering. Denormalized from the YAML frontmatter onto its own
   * column so listings can filter/sort on it without loading `body`.
   */
  description: string;
  /** The SKILL.md body (markdown after the YAML frontmatter). */
  body: string;
  /**
   * Structured YAML frontmatter (excluding `name` and `description`, which live as
   * top-level columns). Stored as Mongoose Mixed so callers can extend without schema
   * churn; validated in strict mode via `validateSkillFrontmatter` — unknown keys
   * are rejected so expanding the allowed set is an intentional code change.
   */
  frontmatter: Record<string, unknown>;
  category?: string;
  author: Types.ObjectId;
  authorName: string;
  version: number;
  /**
   * Provenance of this skill's canonical definition.
   * - `inline` — authored inside LibreChat (the only value phase 1 produces).
   * - `github` / `notion` — reserved for phase 2+ external sync. Kept in the
   *   enum so a future sync worker can populate it without a migration.
   */
  source: 'inline' | 'github' | 'notion';
  /**
   * Provenance payload keyed by `source`. Phase 2+ sync workers will store
   * upstream identifiers (commit SHA, page id, etc.) here. Unused in phase 1.
   */
  sourceMetadata?: Record<string, unknown>;
  /** Denormalized count of associated `SkillFile` rows. Kept in sync by skill methods. */
  fileCount: number;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
  /** Computed from ACL at read time, never persisted. */
  isPublic?: boolean;
}

export interface ISkillDocument extends ISkill, Document {}

/**
 * Lean summary projection returned by `listSkillsByAccess`. The list query
 * uses a narrow `.select()` that omits `body` and `frontmatter` to keep
 * payloads small, so those fields are truthfully absent on summary rows.
 */
export type ISkillSummary = Omit<ISkill, 'body' | 'frontmatter'>;

/**
 * SkillFile — metadata for a file bundled inside a skill.
 * Blob content lives in the existing file storage layer (local/S3/etc.) and is
 * addressed via `source` + `filepath` + `file_id` (mirroring the File schema).
 * `(skillId, relativePath)` is unique per skill.
 */
export interface ISkillFile {
  skillId: Types.ObjectId;
  relativePath: string;
  file_id: string;
  filename: string;
  filepath: string;
  source: string;
  mimeType: string;
  bytes: number;
  category: 'script' | 'reference' | 'asset' | 'other';
  isExecutable: boolean;
  author: Types.ObjectId;
  tenantId?: string;
  /** Lazily cached text content (≤ 512 KB). Populated on first read; cleared on re-upload. */
  content?: string;
  /** Set on first read. `true` prevents repeated storage reads for non-text files. */
  isBinary?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISkillFileDocument extends ISkillFile, Document {}
