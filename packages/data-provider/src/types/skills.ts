import type { FileSources } from './files';

/**
 * Source of a skill — where its canonical definition came from.
 * `inline` means the skill was authored directly in LibreChat.
 * `github` / `notion` are reserved for future sync integrations.
 */
export type SkillSource = 'inline' | 'github' | 'notion';

/**
 * Category inferred from a skill file's top-level directory prefix.
 * `script` for `scripts/...`, `reference` for `references/...`, `asset` for `assets/...`,
 * everything else (including root-level files) is `other`.
 */
export type SkillFileCategory = 'script' | 'reference' | 'asset' | 'other';

/**
 * Allowed value types inside a skill's YAML frontmatter.
 * Kept strict so callers cannot slip arbitrary `unknown` payloads through the API.
 */
export type SkillFrontmatterValue = string | number | boolean | string[] | null;

/**
 * Structured YAML frontmatter for a skill. All keys are optional on the wire
 * because not every skill document carries a complete frontmatter block —
 * `name` and `description` live as first-class columns on `TSkill` itself,
 * and frontmatter is an extension bag for additional fields like `when-to-use`,
 * `allowed-tools`, etc.
 */
export type SkillFrontmatter = {
  name?: string;
  description?: string;
} & Record<string, SkillFrontmatterValue | undefined>;

/**
 * Provenance metadata for skills that originated from an external source
 * (e.g. a GitHub commit SHA or a Notion page id).
 */
export type SkillSourceMetadata = Record<string, string | number | boolean>;

/**
 * API shape for a full skill (returned by GET `/api/skills/:id`).
 */
export type TSkill = {
  _id: string;
  name: string;
  displayTitle?: string;
  description: string;
  body: string;
  frontmatter?: SkillFrontmatter;
  category?: string;
  author: string;
  authorName: string;
  version: number;
  source: SkillSource;
  sourceMetadata?: SkillSourceMetadata;
  fileCount: number;
  isPublic?: boolean;
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Summary shape used in list endpoints — omits `body` to keep list payloads small.
 */
export type TSkillSummary = Omit<TSkill, 'body' | 'frontmatter'> & {
  frontmatter?: SkillFrontmatter;
};

/**
 * Metadata for a single file bundled inside a skill.
 * File content itself is fetched separately via the file download endpoint.
 */
export type TSkillFile = {
  _id: string;
  skillId: string;
  relativePath: string;
  file_id: string;
  filename: string;
  filepath: string;
  source: FileSources;
  mimeType: string;
  bytes: number;
  category: SkillFileCategory;
  isExecutable: boolean;
  author: string;
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
};

/** Request body for POST `/api/skills`. */
export type TCreateSkill = {
  name: string;
  displayTitle?: string;
  description: string;
  body: string;
  frontmatter?: Partial<SkillFrontmatter>;
  category?: string;
};

/** Partial payload for PATCH `/api/skills/:id` — all fields optional. */
export type TUpdateSkillPayload = {
  name?: string;
  displayTitle?: string;
  description?: string;
  body?: string;
  frontmatter?: Partial<SkillFrontmatter>;
  category?: string;
};

/** Variables passed into the update mutation: id + expectedVersion + partial payload. */
export type TUpdateSkillVariables = {
  id: string;
  expectedVersion: number;
  payload: TUpdateSkillPayload;
};

/** Response from a successful PATCH — includes the bumped version. */
export type TUpdateSkillResponse = TSkill;

/** Response from a 409 concurrency conflict — includes the current authoritative state. */
export type TSkillConflictResponse = {
  error: 'skill_version_conflict';
  current: TSkill;
};

/** Query params for GET `/api/skills` (list). */
export type TSkillListRequest = {
  category?: string;
  search?: string;
  limit?: number;
  cursor?: string;
};

/** Paginated list response. `after` is the cursor to pass for the next page. */
export type TSkillListResponse = {
  skills: TSkillSummary[];
  has_more: boolean;
  after: string | null;
};

/** Response from DELETE `/api/skills/:id`. */
export type TDeleteSkillResponse = {
  id: string;
  deleted: true;
};

/** Response from GET `/api/skills/:id/files`. */
export type TListSkillFilesResponse = {
  files: TSkillFile[];
};

/**
 * Upload body for POST `/api/skills/:id/files`.
 * In phase 1 the backend responds with 501; the client contract is still defined here
 * so hooks are stable when the upload pipeline is wired up in phase 2.
 */
export type TUploadSkillFilePayload = {
  relativePath: string;
};

/** Response from DELETE `/api/skills/:id/files/:relativePath`. */
export type TDeleteSkillFileResponse = {
  skillId: string;
  relativePath: string;
  deleted: true;
};

/** Variables passed into the skill file upload mutation. */
export type TUploadSkillFileVariables = {
  skillId: string;
  formData: FormData;
};

/** Variables passed into the skill file delete mutation. */
export type TDeleteSkillFileVariables = {
  skillId: string;
  relativePath: string;
};
