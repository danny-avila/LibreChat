import type { FileSources } from './files';

/**
 * Shared skill validation constants — the single source of truth for name,
 * description, title, body, and file-path length limits. Mirrored by
 * `packages/data-schemas/src/methods/skill.ts`; whenever those constants
 * change, the DB-side validators MUST be updated to match.
 *
 * Exported from `librechat-data-provider` so both frontend form validators
 * and backend Mongoose pre-save hooks use the same literals.
 */
export const SKILL_NAME_MAX_LENGTH = 64;
export const SKILL_DESCRIPTION_MAX_LENGTH = 1024;
export const SKILL_DESCRIPTION_SHORT_THRESHOLD = 20;
export const SKILL_DISPLAY_TITLE_MAX_LENGTH = 128;
export const SKILL_BODY_MAX_LENGTH = 100_000;

/**
 * Kebab-case identifier pattern: must start with a lowercase letter or digit,
 * and contain only lowercase letters, digits, and hyphens. Mirrors the
 * backend `SKILL_NAME_PATTERN` in `packages/data-schemas/src/methods/skill.ts`.
 */
export const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

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
 *
 * Reserved for phase 2+ external sync — no code path currently populates this
 * in phase 1, but the column exists so a future sync worker can use it
 * without a schema migration.
 */
export type SkillSourceMetadata = Record<string, string | number | boolean>;

/**
 * A non-blocking coaching hint surfaced alongside a successful create/update
 * response. Unlike validation errors (which return 400 and block the write),
 * warnings ride on the 2xx response so the UI can show inline feedback
 * without rejecting the user's input. Example: "description is too short,
 * Claude may undertrigger this skill".
 */
export type TSkillWarning = {
  field: string;
  code: string;
  message: string;
  severity: 'warning';
};

/**
 * API shape for a full skill (returned by GET `/api/skills/:id`).
 *
 * Field semantics:
 * - `name` is the machine-readable kebab-case identifier Claude sees in its
 *   skill manifest. It's what drives triggering and must be stable across
 *   edits. Unique per author+tenant.
 * - `displayTitle` is the human-readable UI label only. NOT sent to Claude,
 *   NOT part of the trigger path — purely cosmetic.
 * - `description` is the "when to use this skill" sentence. Highest-leverage
 *   field for trigger accuracy; a short/vague one causes undertriggering.
 * - `frontmatter` is the structured YAML bag minus `name`/`description`
 *   (those live as top-level columns). Validated strictly against a known
 *   key set server-side.
 * - `source`/`sourceMetadata` are reserved for phase 2+ external sync and
 *   always `'inline'` / absent in phase 1.
 */
export type TSkill = {
  _id: string;
  name: string;
  displayTitle?: string;
  description: string;
  body: string;
  frontmatter?: SkillFrontmatter;
  category?: string;
  /**
   * UI-only phase 1. The backend doesn't persist `invocationMode` yet —
   * forms default to `auto` and discard the value on save. Phase 2 will
   * move this to a first-class column.
   */
  invocationMode?: import('../types').InvocationMode;
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
  /**
   * Present on POST/PATCH responses when the server emitted non-blocking
   * coaching warnings (e.g. description too short). Never present on GET
   * responses.
   */
  warnings?: TSkillWarning[];
};

/**
 * Summary shape used in list endpoints — omits `body` and `frontmatter` to keep
 * list payloads small. Callers that need the full body/frontmatter must fetch
 * the detail via `GET /api/skills/:id`.
 */
export type TSkillSummary = Omit<TSkill, 'body' | 'frontmatter'>;

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
