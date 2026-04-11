import { ResourceType } from 'librechat-data-provider';
import type { Model, Types, FilterQuery } from 'mongoose';
import type { ISkill, ISkillDocument, ISkillFile, ISkillFileDocument } from '~/types/skill';
import { isValidObjectIdString } from '~/utils/objectId';
import { escapeRegExp } from '~/utils/string';
import logger from '~/config/winston';

/** ---------- Validation helpers (pure) ---------- */

export type ValidationIssue = {
  field: string;
  code: string;
  message: string;
};

const SKILL_NAME_MAX = 64;
const SKILL_DESCRIPTION_MAX = 1024;
const SKILL_DISPLAY_TITLE_MAX = 128;
const SKILL_BODY_MAX = 100_000;
const SKILL_FILE_PATH_MAX = 500;
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const RELATIVE_PATH_CHARS = /^[a-zA-Z0-9._\-/]+$/;

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
  if (lowered.includes('anthropic') || lowered.includes('claude')) {
    issues.push({
      field: 'name',
      code: 'RESERVED',
      message: 'Name cannot contain "anthropic" or "claude"',
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
  skills: Array<ISkill & { _id: Types.ObjectId }>;
  has_more: boolean;
  after: string | null;
};

export type UpdateSkillResult =
  | { status: 'updated'; skill: ISkill & { _id: Types.ObjectId } }
  | { status: 'conflict'; current: ISkill & { _id: Types.ObjectId } }
  | { status: 'not_found' };

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

  async function createSkill(data: CreateSkillInput): Promise<ISkill & { _id: Types.ObjectId }> {
    const nameIssues = validateSkillName(data.name);
    const descIssues = validateSkillDescription(data.description);
    const bodyIssues = validateSkillBody(data.body);
    const titleIssues = validateSkillDisplayTitle(data.displayTitle);
    const issues = [...nameIssues, ...descIssues, ...bodyIssues, ...titleIssues];
    if (issues.length > 0) {
      const error = new Error('Skill validation failed');
      (error as Error & { issues?: ValidationIssue[]; code?: string }).issues = issues;
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
    return doc.toObject() as unknown as ISkill & { _id: Types.ObjectId };
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
        'name displayTitle description category author authorName version source fileCount tenantId createdAt updatedAt',
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
      skills: sliced as unknown as Array<ISkill & { _id: Types.ObjectId }>,
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
    if (issues.length > 0) {
      const error = new Error('Skill validation failed');
      (error as Error & { issues?: ValidationIssue[]; code?: string }).issues = issues;
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

  async function deleteSkillFilesBySkillId(skillId: Types.ObjectId | string): Promise<number> {
    const SkillFile = mongoose.models.SkillFile as Model<ISkillFileDocument>;
    const res = await SkillFile.deleteMany({ skillId });
    return res.deletedCount ?? 0;
  }

  async function deleteSkill(id: string): Promise<{ deleted: boolean }> {
    if (!isValidObjectIdString(id)) {
      return { deleted: false };
    }
    const Skill = mongoose.models.Skill as Model<ISkillDocument>;
    const objectId = new ObjectId(id);
    const res = await Skill.deleteOne({ _id: objectId });
    if (!res.deletedCount) {
      return { deleted: false };
    }
    await deleteSkillFilesBySkillId(objectId);
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

  async function countSkillFiles(skillId: Types.ObjectId | string): Promise<number> {
    const SkillFile = mongoose.models.SkillFile as Model<ISkillFileDocument>;
    return SkillFile.countDocuments({ skillId });
  }

  /**
   * Atomically bumps `Skill.version` and adjusts `fileCount` by `delta`.
   * `delta` is `+1` when a new file is inserted, `-1` when one is deleted, and
   * `0` when an existing file is replaced in place.
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
    const rows = await SkillFile.find({ skillId }).sort({ relativePath: 1 }).lean();
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
    // Detect new-vs-replace by pre-checking existence; doing it inside the same
    // method lets us avoid a recount race with concurrent operations.
    const existing = await SkillFile.findOne({
      skillId: row.skillId,
      relativePath: row.relativePath,
    })
      .select('_id')
      .lean();

    const upserted = await SkillFile.findOneAndUpdate(
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
        },
      },
      { new: true, upsert: true },
    ).lean();

    await bumpSkillVersionAndAdjustFileCount(row.skillId, existing ? 0 : 1);
    return upserted as unknown as ISkillFile & { _id: Types.ObjectId };
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

  async function getSkillFile(
    skillId: Types.ObjectId | string,
    relativePath: string,
  ): Promise<(ISkillFile & { _id: Types.ObjectId }) | null> {
    const SkillFile = mongoose.models.SkillFile as Model<ISkillFileDocument>;
    const doc = await SkillFile.findOne({ skillId, relativePath }).lean();
    return (doc as unknown as (ISkillFile & { _id: Types.ObjectId }) | null) ?? null;
  }

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
    getSkillFile,
    deleteSkillFilesBySkillId,
    countSkillFiles,
  };
}

export type SkillMethods = ReturnType<typeof createSkillMethods>;
