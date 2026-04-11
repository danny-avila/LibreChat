import type { Document, Types } from 'mongoose';

/**
 * Skill — the single source of truth for a LibreChat skill.
 * Each document is the full SKILL.md body plus structured frontmatter and metadata.
 * The `version` field is an integer monotonic counter used for optimistic concurrency.
 */
export interface ISkill {
  name: string;
  displayTitle?: string;
  description: string;
  body: string;
  /**
   * Structured YAML frontmatter (excluding `name` and `description`, which live as
   * top-level columns). Stored as Mongoose Mixed so callers can extend without schema
   * churn; the API-level type (in `librechat-data-provider`) constrains the wire shape.
   */
  frontmatter: Record<string, unknown>;
  category?: string;
  author: Types.ObjectId;
  authorName: string;
  version: number;
  source: 'inline' | 'github' | 'notion';
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
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISkillFileDocument extends ISkillFile, Document {}
