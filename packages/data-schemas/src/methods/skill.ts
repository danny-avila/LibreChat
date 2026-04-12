import {
  ResourceType,
  SKILL_NAME_MAX_LENGTH,
  SKILL_DESCRIPTION_MAX_LENGTH,
  SKILL_DESCRIPTION_SHORT_THRESHOLD as SKILL_DESCRIPTION_SHORT_THRESHOLD_SHARED,
  SKILL_DISPLAY_TITLE_MAX_LENGTH,
  SKILL_BODY_MAX_LENGTH,
  SKILL_NAME_PATTERN as SKILL_NAME_PATTERN_SHARED,
} from 'librechat-data-provider';
import type { Model, Types, FilterQuery } from 'mongoose';
import type {
  ISkill,
  ISkillDocument,
  ISkillFile,
  ISkillFileDocument,
  ISkillSummary,
} from '~/types/skill';
import { isValidObjectIdString } from '~/utils/objectId';
import { escapeRegExp } from '~/utils/string';
import logger from '~/config/winston';

/** ---------- Validation helpers (pure) ---------- */

/**
 * A single validation issue emitted by a skill validator. Most issues are
 * errors and block the mutation; some are warnings (e.g. "description is
 * awfully short, Claude may undertrigger the skill") that surface inline
 * coaching without rejecting the request.
 */
export type ValidationIssue = {
  field: string;
  code: string;
  message: string;
  /**
   * Defaults to `'error'` when omitted. Errors cause `createSkill` /
   * `updateSkill` to throw with code `SKILL_VALIDATION_FAILED`; warnings
   * are surfaced on successful responses so the UI can show inline feedback.
   */
  severity?: 'error' | 'warning';
};

/** Partition an issue list into blocking errors and non-blocking warnings. */
export function partitionIssues(issues: ValidationIssue[]): {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
} {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  for (const issue of issues) {
    if (issue.severity === 'warning') {
      warnings.push(issue);
    } else {
      errors.push(issue);
    }
  }
  return { errors, warnings };
}

const SKILL_NAME_MAX = SKILL_NAME_MAX_LENGTH;
const SKILL_DESCRIPTION_MAX = SKILL_DESCRIPTION_MAX_LENGTH;
const SKILL_DESCRIPTION_SHORT_THRESHOLD = SKILL_DESCRIPTION_SHORT_THRESHOLD_SHARED;
const SKILL_DISPLAY_TITLE_MAX = SKILL_DISPLAY_TITLE_MAX_LENGTH;
const SKILL_BODY_MAX = SKILL_BODY_MAX_LENGTH;
const SKILL_FILE_PATH_MAX = 500;
const SKILL_NAME_PATTERN = SKILL_NAME_PATTERN_SHARED;
const RELATIVE_PATH_CHARS = /^[a-zA-Z0-9._\-/]+$/;

/**
 * Brand namespaces reserved for Anthropic-published skills and first-party
 * bundles. Matched as prefixes, so `anthropic-helper` is rejected but
 * `research-anthropic-helper` is fine.
 */
const RESERVED_NAME_PREFIXES = ['anthropic-', 'claude-'];

/**
 * Slash-command names that collide with LibreChat / Claude Code CLI commands.
 * A skill with one of these names would shadow a real command in any
 * slash-command UI. Matched exactly (not as prefix).
 */
const RESERVED_NAME_WORDS = new Set([
  'help',
  'clear',
  'compact',
  'model',
  'exit',
  'quit',
  'settings',
  'anthropic',
  'claude',
]);

export function validateSkillName(name: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (typeof name !== 'string' || name.length === 0) {
    issues.push({ field: 'name', code: 'REQUIRED', message: 'Name is required' });
    return issues;
  }
  if (name.length > SKILL_NAME_MAX) {
    issues.push({
      field: 'name',
      code: 'TOO_LONG',
      message: `Name must be ${SKILL_NAME_MAX} characters or less`,
    });
  }
  if (!SKILL_NAME_PATTERN.test(name)) {
    issues.push({
      field: 'name',
      code: 'INVALID_FORMAT',
      message:
        'Name must be kebab-case: start with a lowercase letter or digit and contain only lowercase letters, digits, and hyphens',
    });
  }
  const lowered = name.toLowerCase();
  if (RESERVED_NAME_PREFIXES.some((prefix) => lowered.startsWith(prefix))) {
    issues.push({
      field: 'name',
      code: 'RESERVED_PREFIX',
      message: `Name cannot start with ${RESERVED_NAME_PREFIXES.map((p) => `"${p}"`).join(' or ')}`,
    });
  }
  if (RESERVED_NAME_WORDS.has(lowered)) {
    issues.push({
      field: 'name',
      code: 'RESERVED_WORD',
      message: `"${name}" is a reserved name`,
    });
  }
  return issues;
}

export function validateSkillDescription(description: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (typeof description !== 'string' || description.trim().length === 0) {
    issues.push({
      field: 'description',
      code: 'REQUIRED',
      message: 'Description is required',
    });
    return issues;
  }
  if (description.length > SKILL_DESCRIPTION_MAX) {
    issues.push({
      field: 'description',
      code: 'TOO_LONG',
      message: `Description must be ${SKILL_DESCRIPTION_MAX} characters or less`,
    });
  }
  if (description.trim().length < SKILL_DESCRIPTION_SHORT_THRESHOLD) {
    issues.push({
      field: 'description',
      code: 'TOO_SHORT',
      severity: 'warning',
      message:
        'Short descriptions may cause Claude to miss triggering opportunities — aim for a concrete "when to use this skill" sentence.',
    });
  }
  return issues;
}

export function validateSkillBody(body: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (body !== undefined && typeof body !== 'string') {
    issues.push({ field: 'body', code: 'INVALID_TYPE', message: 'Body must be a string' });
    return issues;
  }
  if (typeof body === 'string' && body.length > SKILL_BODY_MAX) {
    issues.push({
      field: 'body',
      code: 'TOO_LONG',
      message: `Body must be ${SKILL_BODY_MAX} characters or less`,
    });
  }
  return issues;
}

export function validateSkillDisplayTitle(displayTitle: unknown): ValidationIssue[] {
  if (displayTitle === undefined || displayTitle === null) {
    return [];
  }
  if (typeof displayTitle !== 'string') {
    return [
      { field: 'displayTitle', code: 'INVALID_TYPE', message: 'Display title must be a string' },
    ];
  }
  if (displayTitle.length > SKILL_DISPLAY_TITLE_MAX) {
    return [
      {
        field: 'displayTitle',
        code: 'TOO_LONG',
        message: `Display title must be ${SKILL_DISPLAY_TITLE_MAX} characters or less`,
      },
    ];
  }
  return [];
}

/**
 * Known fields allowed inside a skill's YAML frontmatter. Anything else is
 * rejected in strict mode. The list is derived from Anthropic's Agent Skills
 * spec plus the fields LibreChat needs to pass through (`name`/`description`
 * are duplicated from the top-level columns because real `SKILL.md` files
 * include them in their frontmatter block).
 */
const ALLOWED_FRONTMATTER_KEYS = new Set<string>([
  'name',
  'description',
  'when-to-use',
  'allowed-tools',
  'arguments',
  'argument-hint',
  'user-invocable',
  'disable-model-invocation',
  'model',
  'effort',
  'context',
  'agent',
  'paths',
  'shell',
  'hooks',
  'version',
  'metadata',
]);

const FRONTMATTER_MAX_STRING = 2000;
const FRONTMATTER_MAX_ARRAY = 100;
const FRONTMATTER_MAX_DEPTH = 4;

type FrontmatterKind = 'string' | 'number' | 'boolean' | 'stringArray';

const FRONTMATTER_KIND: Record<string, FrontmatterKind | FrontmatterKind[]> = {
  name: 'string',
  description: 'string',
  'when-to-use': 'string',
  'allowed-tools': ['string', 'stringArray'],
  arguments: ['string', 'stringArray'],
  'argument-hint': 'string',
  'user-invocable': 'boolean',
  'disable-model-invocation': 'boolean',
  model: 'string',
  effort: ['string', 'number'],
  context: 'string',
  agent: 'string',
  paths: ['string', 'stringArray'],
  shell: 'string',
  version: 'string',
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= FRONTMATTER_MAX_ARRAY &&
    value.every((v) => typeof v === 'string' && v.length <= FRONTMATTER_MAX_STRING)
  );
}

function matchesKind(value: unknown, kind: FrontmatterKind): boolean {
  if (kind === 'string') {
    return typeof value === 'string' && value.length <= FRONTMATTER_MAX_STRING;
  }
  if (kind === 'number') {
    return typeof value === 'number' && Number.isFinite(value);
  }
  if (kind === 'boolean') {
    return typeof value === 'boolean';
  }
  return isStringArray(value);
}

/**
 * Shallow structural sanity check for `hooks`/`metadata` objects. We don't
 * know their full schema yet, so we just verify they are plain objects with
 * JSON-serializable leaf values up to a max depth — enough to block pathological
 * payloads without constraining legitimate frontmatter extensions.
 */
function isJsonSafe(value: unknown, depth: number): boolean {
  if (depth > FRONTMATTER_MAX_DEPTH) {
    return false;
  }
  if (value === null) return true;
  const t = typeof value;
  if (t === 'string') return (value as string).length <= FRONTMATTER_MAX_STRING;
  if (t === 'number') return Number.isFinite(value);
  if (t === 'boolean') return true;
  if (Array.isArray(value)) {
    if (value.length > FRONTMATTER_MAX_ARRAY) return false;
    return value.every((v) => isJsonSafe(v, depth + 1));
  }
  if (isPlainObject(value)) {
    return Object.values(value).every((v) => isJsonSafe(v, depth + 1));
  }
  return false;
}

/**
 * Validate a skill's structured YAML frontmatter. Strict mode: unknown keys
 * are rejected so any expansion of the allowed set is an intentional code
 * change. Known keys are type-checked against `FRONTMATTER_KIND`; `hooks` and
 * `metadata` fall back to a shallow JSON-safety check because their full
 * schemas live outside this module.
 */
export function validateSkillFrontmatter(frontmatter: unknown): ValidationIssue[] {
  if (frontmatter === undefined || frontmatter === null) {
    return [];
  }
  if (!isPlainObject(frontmatter)) {
    return [
      {
        field: 'frontmatter',
        code: 'INVALID_TYPE',
        message: 'Frontmatter must be a plain object',
      },
    ];
  }

  const issues: ValidationIssue[] = [];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!ALLOWED_FRONTMATTER_KEYS.has(key)) {
      issues.push({
        field: `frontmatter.${key}`,
        code: 'UNKNOWN_KEY',
        message: `"${key}" is not a recognized frontmatter key`,
      });
      continue;
    }

    if (key === 'hooks' || key === 'metadata') {
      if (!isPlainObject(value) || !isJsonSafe(value, 0)) {
        issues.push({
          field: `frontmatter.${key}`,
          code: 'INVALID_SHAPE',
          message: `"${key}" must be a plain JSON-safe object (max depth ${FRONTMATTER_MAX_DEPTH}, max string ${FRONTMATTER_MAX_STRING})`,
        });
      }
      continue;
    }

    const expected = FRONTMATTER_KIND[key];
    if (!expected) {
      continue;
    }
    const kinds = Array.isArray(expected) ? expected : [expected];
    if (!kinds.some((kind) => matchesKind(value, kind))) {
      issues.push({
        field: `frontmatter.${key}`,
        code: 'INVALID_TYPE',
        message: `"${key}" must be ${kinds.join(' or ')}`,
      });
    }
  }
  return issues;
}

export function validateRelativePath(relativePath: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    issues.push({
      field: 'relativePath',
      code: 'REQUIRED',
      message: 'Relative path is required',
    });
    return issues;
  }
  if (relativePath.length > SKILL_FILE_PATH_MAX) {
    issues.push({
      field: 'relativePath',
      code: 'TOO_LONG',
      message: `Relative path must be ${SKILL_FILE_PATH_MAX} characters or less`,
    });
  }
  if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
    issues.push({
      field: 'relativePath',
      code: 'ABSOLUTE_PATH',
      message: 'Relative path must not start with a slash',
    });
  }
  if (!RELATIVE_PATH_CHARS.test(relativePath)) {
    issues.push({
      field: 'relativePath',
      code: 'INVALID_CHARS',
      message: 'Relative path contains invalid characters',
    });
  }
  const segments = relativePath.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    issues.push({
      field: 'relativePath',
      code: 'TRAVERSAL',
      message: 'Relative path cannot contain empty segments or "." / ".."',
    });
  }
  if (relativePath === 'SKILL.md' || segments[0] === 'SKILL.md') {
    issues.push({
      field: 'relativePath',
      code: 'RESERVED',
      message: 'SKILL.md is managed via the skill body, not file uploads',
    });
  }
  return issues;
}

export function inferSkillFileCategory(
  relativePath: string,
): 'script' | 'reference' | 'asset' | 'other' {
  const [top] = relativePath.split('/');
  if (top === 'scripts') return 'script';
  if (top === 'references') return 'reference';
  if (top === 'assets') return 'asset';
  return 'other';
}

/** ---------- Method factory ---------- */

export interface SkillDeps {
  /** Removes all ACL entries for a resource. Injected from PermissionService. */
  removeAllPermissions: (params: { resourceType: string; resourceId: unknown }) => Promise<void>;
  /** Returns resource IDs solely owned by the given user. From createAclEntryMethods. */
  getSoleOwnedResourceIds: (
    userObjectId: Types.ObjectId,
    resourceTypes: string | string[],
  ) => Promise<Types.ObjectId[]>;
}

export type CreateSkillInput = {
  name: string;
  displayTitle?: string;
  description: string;
  body?: string;
  frontmatter?: Record<string, unknown>;
  category?: string;
  author: Types.ObjectId;
  authorName: string;
  source?: 'inline' | 'github' | 'notion';
  sourceMetadata?: Record<string, unknown>;
  tenantId?: string;
};

export type UpdateSkillInput = {
  name?: string;
  displayTitle?: string;
  description?: string;
  body?: string;
  frontmatter?: Record<string, unknown>;
  category?: string;
};

export type UpsertSkillFileInput = {
  skillId: Types.ObjectId | string;
  relativePath: string;
  file_id: string;
  filename: string;
  filepath: string;
  source: string;
  mimeType: string;
  bytes: number;
  isExecutable?: boolean;
  author: Types.ObjectId;
  tenantId?: string;
};

export type ListSkillsByAccessParams = {
  accessibleIds: Types.ObjectId[];
  category?: string;
  search?: string;
  limit: number;
  cursor?: string | null;
};

export type ListSkillsByAccessResult = {
  /**
   * Summary rows — `body` and `frontmatter` are intentionally omitted at the
   * query projection layer to keep list payloads small. Callers that need the
   * full document must fetch the detail via `getSkillById`.
   */
  skills: Array<ISkillSummary & { _id: Types.ObjectId }>;
  has_more: boolean;
  after: string | null;
};

export type UpdateSkillResult =
  | {
      status: 'updated';
      skill: ISkill & { _id: Types.ObjectId };
      warnings: ValidationIssue[];
    }
  | { status: 'conflict'; current: ISkill & { _id: Types.ObjectId } }
  | { status: 'not_found' };

export type CreateSkillResult = {
  skill: ISkill & { _id: Types.ObjectId };
  warnings: ValidationIssue[];
};

export function createSkillMethods(mongoose: typeof import('mongoose'), deps: SkillDeps) {
  const { ObjectId } = mongoose.Types;

  function buildSkillFilter(
    params: Pick<ListSkillsByAccessParams, 'accessibleIds' | 'category' | 'search'>,
  ): FilterQuery<ISkillDocument> {
    const filter: FilterQuery<ISkillDocument> = {
      _id: { $in: params.accessibleIds },
    };
    if (params.category && params.category.length > 0) {
      filter.category = params.category;
    }
    if (params.search && params.search.length > 0) {
      const rx = new RegExp(escapeRegExp(params.search), 'i');
      filter.$or = [{ name: rx }, { description: rx }, { displayTitle: rx }];
    }
    return filter;
  }

  function decodeCursor(
    cursor: string | null | undefined,
  ): { updatedAt: Date; _id: Types.ObjectId } | null {
    if (!cursor || cursor === 'undefined' || cursor === 'null') {
      return null;
    }
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as {
        updatedAt?: string;
        _id?: string;
      };
      if (
        !decoded.updatedAt ||
        !decoded._id ||
        Number.isNaN(new Date(decoded.updatedAt).getTime()) ||
        !isValidObjectIdString(decoded._id)
      ) {
        return null;
      }
      return { updatedAt: new Date(decoded.updatedAt), _id: new ObjectId(decoded._id) };
    } catch (error) {
      logger.warn(`[skill.decodeCursor] Invalid cursor: ${(error as Error).message}`);
      return null;
    }
  }

  function encodeCursor(row: { updatedAt: Date; _id: Types.ObjectId }): string {
    return Buffer.from(
      JSON.stringify({ updatedAt: row.updatedAt.toISOString(), _id: row._id.toString() }),
    ).toString('base64');
  }

  async function createSkill(data: CreateSkillInput): Promise<CreateSkillResult> {
    const issues: ValidationIssue[] = [
      ...validateSkillName(data.name),
      ...validateSkillDescription(data.description),
      ...validateSkillBody(data.body),
      ...validateSkillDisplayTitle(data.displayTitle),
      ...validateSkillFrontmatter(data.frontmatter),
    ];
    const { errors, warnings } = partitionIssues(issues);
    if (errors.length > 0) {
      const error = new Error('Skill validation failed');
      (error as Error & { issues?: ValidationIssue[]; code?: string }).issues = errors;
      (error as Error & { code?: string }).code = 'SKILL_VALIDATION_FAILED';
      throw error;
    }

    const Skill = mongoose.models.Skill as Model<ISkillDocument>;

    // Application-level uniqueness check on (name, author, tenantId).
    // The unique index in the schema is the persistent guarantee, but Mongoose
    // creates indexes asynchronously and tests can race ahead of index creation,
    // so we also enforce it here for deterministic behavior and a clean error.
    const existing = await Skill.findOne({
      name: data.name,
      author: data.author,
      tenantId: data.tenantId ?? null,
    })
      .select('_id')
      .lean();
    if (existing) {
      const error = new Error(`A skill with name "${data.name}" already exists for this author`);
      (error as Error & { code?: string | number }).code = 11000;
      throw error;
    }

    const doc = await Skill.create({
      name: data.name,
      displayTitle: data.displayTitle,
      description: data.description,
      body: data.body ?? '',
      frontmatter: data.frontmatter ?? {},
      category: data.category ?? '',
      author: data.author,
      authorName: data.authorName,
      version: 1,
      source: data.source ?? 'inline',
      sourceMetadata: data.sourceMetadata,
      fileCount: 0,
      tenantId: data.tenantId,
    });
    return {
      skill: doc.toObject() as unknown as ISkill & { _id: Types.ObjectId },
      warnings,
    };
  }

  async function getSkillById(
    id: string | Types.ObjectId,
  ): Promise<(ISkill & { _id: Types.ObjectId }) | null> {
    if (typeof id === 'string' && !isValidObjectIdString(id)) {
      return null;
    }
    const Skill = mongoose.models.Skill as Model<ISkillDocument>;
    const doc = await Skill.findById(id).lean();
    return (doc as unknown as (ISkill & { _id: Types.ObjectId }) | null) ?? null;
  }

  async function listSkillsByAccess(
    params: ListSkillsByAccessParams,
  ): Promise<ListSkillsByAccessResult> {
    const Skill = mongoose.models.Skill as Model<ISkillDocument>;
    const limit = Math.min(Math.max(1, params.limit || 20), 100);

    const baseFilter = buildSkillFilter(params);
    const cursor = decodeCursor(params.cursor);

    let filter: FilterQuery<ISkillDocument> = baseFilter;
    if (cursor) {
      const cursorCondition: FilterQuery<ISkillDocument> = {
        $or: [
          { updatedAt: { $lt: cursor.updatedAt } },
          { updatedAt: cursor.updatedAt, _id: { $gt: cursor._id } },
        ],
      };
      filter = { $and: [baseFilter, cursorCondition] };
    }

    const rows = await Skill.find(filter)
      .sort({ updatedAt: -1, _id: 1 })
      .limit(limit + 1)
      .select(
        'name displayTitle description category author authorName version source sourceMetadata fileCount tenantId createdAt updatedAt',
      )
      .lean();

    const has_more = rows.length > limit;
    const sliced = has_more ? rows.slice(0, limit) : rows;
    const last = sliced[sliced.length - 1];
    const after =
      has_more && last
        ? encodeCursor({
            updatedAt: last.updatedAt as Date,
            _id: last._id as Types.ObjectId,
          })
        : null;

    return {
      skills: sliced as unknown as Array<ISkillSummary & { _id: Types.ObjectId }>,
      has_more,
      after,
    };
  }

  async function updateSkill(params: {
    id: string;
    expectedVersion: number;
    update: UpdateSkillInput;
  }): Promise<UpdateSkillResult> {
    const { id, expectedVersion, update } = params;
    if (!isValidObjectIdString(id)) {
      return { status: 'not_found' };
    }

    const issues: ValidationIssue[] = [];
    if (update.name !== undefined) issues.push(...validateSkillName(update.name));
    if (update.description !== undefined)
      issues.push(...validateSkillDescription(update.description));
    if (update.body !== undefined) issues.push(...validateSkillBody(update.body));
    if (update.displayTitle !== undefined)
      issues.push(...validateSkillDisplayTitle(update.displayTitle));
    if (update.frontmatter !== undefined)
      issues.push(...validateSkillFrontmatter(update.frontmatter));
    const { errors, warnings } = partitionIssues(issues);
    if (errors.length > 0) {
      const error = new Error('Skill validation failed');
      (error as Error & { issues?: ValidationIssue[]; code?: string }).issues = errors;
      (error as Error & { code?: string }).code = 'SKILL_VALIDATION_FAILED';
      throw error;
    }

    const Skill = mongoose.models.Skill as Model<ISkillDocument>;
    const setPayload: Record<string, unknown> = {};
    if (update.name !== undefined) setPayload.name = update.name;
    if (update.displayTitle !== undefined) setPayload.displayTitle = update.displayTitle;
    if (update.description !== undefined) setPayload.description = update.description;
    if (update.body !== undefined) setPayload.body = update.body;
    if (update.frontmatter !== undefined) setPayload.frontmatter = update.frontmatter;
    if (update.category !== undefined) setPayload.category = update.category;

    const result = await Skill.findOneAndUpdate(
      { _id: new ObjectId(id), version: expectedVersion },
      { $set: setPayload, $inc: { version: 1 } },
      { new: true },
    ).lean();

    if (result) {
      return {
        status: 'updated',
        skill: result as unknown as ISkill & { _id: Types.ObjectId },
        warnings,
      };
    }

    const current = await Skill.findById(id).lean();
    if (!current) {
      return { status: 'not_found' };
    }
    return {
      status: 'conflict',
      current: current as unknown as ISkill & { _id: Types.ObjectId },
    };
  }

  async function deleteSkill(id: string): Promise<{ deleted: boolean }> {
    if (!isValidObjectIdString(id)) {
      return { deleted: false };
    }
    const Skill = mongoose.models.Skill as Model<ISkillDocument>;
    const SkillFile = mongoose.models.SkillFile as Model<ISkillFileDocument>;
    const objectId = new ObjectId(id);
    const res = await Skill.deleteOne({ _id: objectId });
    if (!res.deletedCount) {
      return { deleted: false };
    }
    await SkillFile.deleteMany({ skillId: objectId });
    try {
      await deps.removeAllPermissions({ resourceType: ResourceType.SKILL, resourceId: id });
    } catch (error) {
      logger.error(`[deleteSkill] Error removing permissions for ${id}:`, error);
    }
    return { deleted: true };
  }

  async function deleteUserSkills(userId: Types.ObjectId | string): Promise<number> {
    const userObjectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
    const Skill = mongoose.models.Skill as Model<ISkillDocument>;
    const soleOwned = await deps.getSoleOwnedResourceIds(userObjectId, ResourceType.SKILL);
    if (soleOwned.length === 0) {
      return 0;
    }
    const SkillFile = mongoose.models.SkillFile as Model<ISkillFileDocument>;
    await SkillFile.deleteMany({ skillId: { $in: soleOwned } });
    const res = await Skill.deleteMany({ _id: { $in: soleOwned } });
    await Promise.allSettled(
      soleOwned.map((rid) =>
        deps
          .removeAllPermissions({
            resourceType: ResourceType.SKILL,
            resourceId: rid.toString(),
          })
          .catch((error) =>
            logger.error(`[deleteUserSkills] Error removing permissions for ${rid}:`, error),
          ),
      ),
    );
    return res.deletedCount ?? 0;
  }

  /**
   * Atomically bumps `Skill.version` and adjusts `fileCount` by `delta`.
   * `delta` is `+1` when a new file is inserted, `-1` when one is deleted, and
   * `0` when an existing file is replaced in place.
   *
   * NOTE on consistency: this runs as a **separate** MongoDB operation from
   * the `upsertSkillFile` / `deleteSkillFile` that triggers it. MongoDB only
   * provides multi-document ACID via transactions (which require a replica
   * set), and LibreChat does not currently require that deployment shape. In
   * the rare case where a SkillFile write succeeds but the subsequent
   * `findByIdAndUpdate` here fails (connection drop, primary failover mid-
   * request), the `fileCount` on the parent Skill will drift from the true
   * row count until the next successful upsert/delete corrects it. Options if
   * this ever shows up in practice:
   *   - wrap both ops in a transaction (requires a replica set)
   *   - periodic reconciliation: `fileCount = count(skill_files where skillId = ?)`
   *   - treat `fileCount` as advisory and recompute on read when accuracy
   *     matters
   * For phase 1, skill files are stubbed at the upload boundary, so the risk
   * window doesn't open in practice.
   */
  async function bumpSkillVersionAndAdjustFileCount(
    skillId: Types.ObjectId | string,
    delta: number,
  ): Promise<void> {
    const Skill = mongoose.models.Skill as Model<ISkillDocument>;
    const updateOps: Record<string, Record<string, number>> = { $inc: { version: 1 } };
    if (delta !== 0) {
      updateOps.$inc.fileCount = delta;
    }
    await Skill.findByIdAndUpdate(skillId, updateOps);
  }

  async function listSkillFiles(
    skillId: Types.ObjectId | string,
  ): Promise<Array<ISkillFile & { _id: Types.ObjectId }>> {
    const SkillFile = mongoose.models.SkillFile as Model<ISkillFileDocument>;
    const rows = await SkillFile.find({ skillId })
      .select('-content')
      .sort({ relativePath: 1 })
      .lean();
    return rows as unknown as Array<ISkillFile & { _id: Types.ObjectId }>;
  }

  async function upsertSkillFile(
    row: UpsertSkillFileInput,
  ): Promise<ISkillFile & { _id: Types.ObjectId }> {
    const issues = validateRelativePath(row.relativePath);
    if (issues.length > 0) {
      const error = new Error('Skill file validation failed');
      (error as Error & { issues?: ValidationIssue[]; code?: string }).issues = issues;
      (error as Error & { code?: string }).code = 'SKILL_FILE_VALIDATION_FAILED';
      throw error;
    }
    const SkillFile = mongoose.models.SkillFile as Model<ISkillFileDocument>;
    const category = inferSkillFileCategory(row.relativePath);
    // Atomic new-vs-replace detection: with `new: false, upsert: true`,
    // `findOneAndUpdate` returns the pre-update document (or null if the doc
    // did not exist and was just inserted). Checking the return value replaces
    // a non-atomic `findOne` + `upsert` pair that could double-count on
    // concurrent uploads of the same (skillId, relativePath).
    const previous = await SkillFile.findOneAndUpdate(
      { skillId: row.skillId, relativePath: row.relativePath },
      {
        $set: {
          skillId: row.skillId,
          relativePath: row.relativePath,
          file_id: row.file_id,
          filename: row.filename,
          filepath: row.filepath,
          source: row.source,
          mimeType: row.mimeType,
          bytes: row.bytes,
          category,
          isExecutable: row.isExecutable ?? false,
          author: row.author,
          tenantId: row.tenantId,
          content: undefined,
          isBinary: undefined,
        },
      },
      { new: false, upsert: true },
    ).lean();
    const delta = previous ? 0 : 1;
    await bumpSkillVersionAndAdjustFileCount(row.skillId, delta);

    // Fetch the current (post-upsert) document for the caller. This second
    // round-trip is an intentional tradeoff for the TOCTOU-safe detection
    // above: `new: false` is required to distinguish insert from replace
    // atomically, which means `findOneAndUpdate` returns the pre-update
    // document (null on insert). A separate `findOne` is the simplest way
    // to return the authoritative post-upsert state. Performance impact is
    // negligible compared to the file upload I/O this sits behind.
    const current = await SkillFile.findOne({
      skillId: row.skillId,
      relativePath: row.relativePath,
    }).lean();
    return current as unknown as ISkillFile & { _id: Types.ObjectId };
  }

  async function deleteSkillFile(
    skillId: Types.ObjectId | string,
    relativePath: string,
  ): Promise<{ deleted: boolean }> {
    const SkillFile = mongoose.models.SkillFile as Model<ISkillFileDocument>;
    const res = await SkillFile.deleteOne({ skillId, relativePath });
    if (!res.deletedCount) {
      return { deleted: false };
    }
    await bumpSkillVersionAndAdjustFileCount(skillId, -1);
    return { deleted: true };
  }

  // The public surface is scoped to methods that handlers and the user
  async function getSkillFileByPath(
    skillId: Types.ObjectId | string,
    relativePath: string,
  ): Promise<(ISkillFile & { _id: Types.ObjectId }) | null> {
    const SkillFile = mongoose.models.SkillFile as Model<ISkillFileDocument>;
    const row = await SkillFile.findOne({ skillId, relativePath }).lean();
    return row as unknown as (ISkillFile & { _id: Types.ObjectId }) | null;
  }

  async function updateSkillFileContent(
    skillId: Types.ObjectId | string,
    relativePath: string,
    update: { content?: string; isBinary?: boolean },
  ): Promise<void> {
    const SkillFile = mongoose.models.SkillFile as Model<ISkillFileDocument>;
    await SkillFile.updateOne({ skillId, relativePath }, { $set: update });
  }

  // deletion controller actually call. The per-skill file cascade on
  // `deleteSkill` is inlined; there's no need for a separate export.
  return {
    createSkill,
    getSkillById,
    listSkillsByAccess,
    updateSkill,
    deleteSkill,
    deleteUserSkills,
    listSkillFiles,
    upsertSkillFile,
    deleteSkillFile,
    getSkillFileByPath,
    updateSkillFileContent,
  };
}

export type SkillMethods = ReturnType<typeof createSkillMethods>;
