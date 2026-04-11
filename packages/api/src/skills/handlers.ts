import { logger } from '@librechat/data-schemas';
import {
  ResourceType,
  AccessRoleIds,
  PrincipalType,
  PermissionBits,
} from 'librechat-data-provider';
import type { Response } from 'express';
import type { Types } from 'mongoose';
import type {
  ISkill,
  ISkillFile,
  ISkillSummary,
  CreateSkillInput,
  CreateSkillResult,
  UpdateSkillInput,
  ListSkillsByAccessResult,
  UpdateSkillResult,
  ValidationIssue,
} from '@librechat/data-schemas';
import type {
  TSkill,
  TSkillFile,
  TSkillSummary,
  TSkillWarning,
  TCreateSkill,
  TUpdateSkillPayload,
  TListSkillFilesResponse,
  TDeleteSkillResponse,
  TDeleteSkillFileResponse,
  TSkillConflictResponse,
} from 'librechat-data-provider';
import type { ServerRequest } from '~/types/http';

/** Thin error shape the skill methods throw on validation failure. */
type SkillValidationError = Error & { code?: string; issues?: ValidationIssue[] };

/** Mongo duplicate-key shape. */
type DuplicateKeyError = Error & { code?: number | string };

/**
 * All dependencies required to serve skill HTTP requests. Every dep is resolved
 * from the legacy api layer (`~/models`, `PermissionService`) so the TS handlers
 * stay pure — no direct imports of mongoose, no direct filesystem I/O.
 */
export interface SkillsHandlersDeps {
  /** Skill CRUD — from `@librechat/data-schemas` `createMethods` output. */
  createSkill: (data: CreateSkillInput) => Promise<CreateSkillResult>;
  getSkillById: (id: string | Types.ObjectId) => Promise<(ISkill & { _id: Types.ObjectId }) | null>;
  listSkillsByAccess: (params: {
    accessibleIds: Types.ObjectId[];
    category?: string;
    search?: string;
    limit: number;
    cursor?: string | null;
  }) => Promise<ListSkillsByAccessResult>;
  updateSkill: (params: {
    id: string;
    expectedVersion: number;
    update: UpdateSkillInput;
  }) => Promise<UpdateSkillResult>;
  deleteSkill: (id: string) => Promise<{ deleted: boolean }>;
  listSkillFiles: (
    skillId: string | Types.ObjectId,
  ) => Promise<Array<ISkillFile & { _id: Types.ObjectId }>>;
  deleteSkillFile: (
    skillId: string | Types.ObjectId,
    relativePath: string,
  ) => Promise<{ deleted: boolean }>;

  /** Access-control primitives from PermissionService. */
  findAccessibleResources: (params: {
    userId: string;
    role?: string | null;
    resourceType: string;
    requiredPermissions: number;
  }) => Promise<Types.ObjectId[]>;
  findPubliclyAccessibleResources: (params: {
    resourceType: string;
    requiredPermissions: number;
  }) => Promise<Types.ObjectId[]>;
  grantPermission: (params: {
    principalType: string;
    principalId: string | Types.ObjectId;
    resourceType: string;
    resourceId: string | Types.ObjectId;
    accessRoleId: string;
    grantedBy: string | Types.ObjectId;
  }) => Promise<unknown>;

  /** ObjectId validation helper from data-schemas. */
  isValidObjectIdString: (value: unknown) => boolean;
}

/**
 * Narrow an opaque `Record<string, unknown>` frontmatter (as stored in Mongoose
 * `Mixed`) to the wire type. Returns `undefined` for empty/missing frontmatter
 * so clients see a clear absence instead of an empty `{}`.
 */
function serializeFrontmatter(
  frontmatter: Record<string, unknown> | undefined,
): TSkill['frontmatter'] {
  if (!frontmatter || typeof frontmatter !== 'object' || Object.keys(frontmatter).length === 0) {
    return undefined;
  }
  return frontmatter as TSkill['frontmatter'];
}

function serializeSourceMetadata(
  metadata: Record<string, unknown> | undefined,
): TSkill['sourceMetadata'] {
  if (!metadata || typeof metadata !== 'object' || Object.keys(metadata).length === 0) {
    return undefined;
  }
  return metadata as TSkill['sourceMetadata'];
}

/** Converts a skill document to the wire format returned by the API. */
function serializeSkill(skill: ISkill & { _id: Types.ObjectId }, publicSet: Set<string>): TSkill {
  return {
    _id: skill._id.toString(),
    name: skill.name,
    displayTitle: skill.displayTitle,
    description: skill.description,
    body: skill.body,
    frontmatter: serializeFrontmatter(skill.frontmatter),
    category: skill.category,
    author: skill.author.toString(),
    authorName: skill.authorName,
    version: skill.version,
    source: skill.source,
    sourceMetadata: serializeSourceMetadata(skill.sourceMetadata),
    fileCount: skill.fileCount,
    isPublic: publicSet.has(skill._id.toString()),
    tenantId: skill.tenantId,
    createdAt: (skill.createdAt ?? new Date()).toISOString(),
    updatedAt: (skill.updatedAt ?? new Date()).toISOString(),
  };
}

function serializeSkillSummary(
  skill: ISkillSummary & { _id: Types.ObjectId },
  publicSet: Set<string>,
): TSkillSummary {
  return {
    _id: skill._id.toString(),
    name: skill.name,
    displayTitle: skill.displayTitle,
    description: skill.description,
    category: skill.category,
    author: skill.author.toString(),
    authorName: skill.authorName,
    version: skill.version,
    source: skill.source,
    sourceMetadata: serializeSourceMetadata(skill.sourceMetadata),
    fileCount: skill.fileCount,
    isPublic: publicSet.has(skill._id.toString()),
    tenantId: skill.tenantId,
    createdAt: (skill.createdAt ?? new Date()).toISOString(),
    updatedAt: (skill.updatedAt ?? new Date()).toISOString(),
  };
}

function serializeSkillFile(file: ISkillFile & { _id: Types.ObjectId }): TSkillFile {
  return {
    _id: file._id.toString(),
    skillId: file.skillId.toString(),
    relativePath: file.relativePath,
    file_id: file.file_id,
    filename: file.filename,
    filepath: file.filepath,
    source: file.source as TSkillFile['source'],
    mimeType: file.mimeType,
    bytes: file.bytes,
    category: file.category,
    isExecutable: file.isExecutable,
    author: file.author.toString(),
    tenantId: file.tenantId,
    createdAt: (file.createdAt ?? new Date()).toISOString(),
    updatedAt: (file.updatedAt ?? new Date()).toISOString(),
  };
}

/**
 * Attach non-blocking coaching warnings to a serialized skill response.
 * Called from `createHandler` and `patchHandler` so clients can show inline
 * feedback (e.g. "description too short") without the write being rejected.
 * Only warning-severity issues come through here — errors are thrown by
 * `createSkill`/`updateSkill` before we reach this point.
 */
function attachWarnings(skill: TSkill, warnings: ValidationIssue[]): TSkill {
  if (!warnings || warnings.length === 0) {
    return skill;
  }
  return {
    ...skill,
    warnings: warnings.map((w) => ({
      field: w.field,
      code: w.code,
      message: w.message,
      severity: 'warning' as const,
    })) satisfies TSkillWarning[],
  };
}

function isValidationError(error: unknown): error is SkillValidationError {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === 'SKILL_VALIDATION_FAILED' || code === 'SKILL_FILE_VALIDATION_FAILED';
}

function isDuplicateKeyError(error: unknown): error is DuplicateKeyError {
  if (!error || typeof error !== 'object') {
    return false;
  }
  return (error as { code?: unknown }).code === 11000;
}

function parseLimit(raw: unknown): number {
  const parsed = parseInt(String(raw ?? '20'), 10);
  if (Number.isNaN(parsed)) {
    return 20;
  }
  return Math.min(Math.max(1, parsed), 100);
}

/**
 * Factory for the typed Express handlers served at `/api/skills`.
 * The legacy `api/server/routes/skills.js` imports this, passes in concrete
 * deps from `~/models` + `PermissionService`, and wires the returned handlers
 * onto the Express router.
 */
export function createSkillsHandlers(deps: SkillsHandlersDeps) {
  const {
    createSkill,
    getSkillById,
    listSkillsByAccess,
    updateSkill,
    deleteSkill,
    listSkillFiles,
    deleteSkillFile,
    findAccessibleResources,
    findPubliclyAccessibleResources,
    grantPermission,
    isValidObjectIdString,
  } = deps;

  async function getPublicSkillIdSet(): Promise<Set<string>> {
    try {
      const publicIds = await findPubliclyAccessibleResources({
        resourceType: ResourceType.SKILL,
        requiredPermissions: PermissionBits.VIEW,
      });
      return new Set(publicIds.map((id) => id.toString()));
    } catch (error) {
      logger.error('[skills] Failed to fetch public skill IDs', error);
      return new Set();
    }
  }

  async function listHandler(req: ServerRequest, res: Response) {
    try {
      const user = req.user;
      if (!user || !user.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const { category, search, limit, cursor } = req.query as {
        category?: string;
        search?: string;
        limit?: string;
        cursor?: string;
      };
      const parsedLimit = parseLimit(limit);

      const [accessibleIds, publicIds] = await Promise.all([
        findAccessibleResources({
          userId: user.id,
          role: user.role,
          resourceType: ResourceType.SKILL,
          requiredPermissions: PermissionBits.VIEW,
        }),
        findPubliclyAccessibleResources({
          resourceType: ResourceType.SKILL,
          requiredPermissions: PermissionBits.VIEW,
        }),
      ]);

      const mergedIds = Array.from(
        new Map([...accessibleIds, ...publicIds].map((id) => [id.toString(), id])).values(),
      );

      const result = await listSkillsByAccess({
        accessibleIds: mergedIds,
        category: typeof category === 'string' && category.length > 0 ? category : undefined,
        search: typeof search === 'string' && search.length > 0 ? search : undefined,
        limit: parsedLimit,
        cursor: typeof cursor === 'string' && cursor.length > 0 ? cursor : null,
      });

      const publicSet = new Set(publicIds.map((id) => id.toString()));
      const skills = result.skills.map((s) => serializeSkillSummary(s, publicSet));

      return res.status(200).json({
        skills,
        has_more: result.has_more,
        after: result.after,
      });
    } catch (error) {
      logger.error('[GET /skills] Error listing skills', error);
      return res.status(500).json({ error: 'Error listing skills' });
    }
  }

  async function createHandler(req: ServerRequest, res: Response) {
    try {
      const user = req.user;
      if (!user || !user.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const body = (req.body ?? {}) as TCreateSkill;

      if (!body.name || typeof body.name !== 'string') {
        return res.status(400).json({ error: 'Skill name is required' });
      }
      if (!body.description || typeof body.description !== 'string') {
        return res.status(400).json({ error: 'Skill description is required' });
      }

      const authorId = (user._id ?? user.id) as unknown as Types.ObjectId;
      const authorName = user.name ?? user.username ?? 'Unknown';

      let createResult: CreateSkillResult;
      try {
        createResult = await createSkill({
          name: body.name,
          displayTitle: body.displayTitle,
          description: body.description,
          body: body.body,
          frontmatter: body.frontmatter as Record<string, unknown> | undefined,
          category: body.category,
          author: authorId,
          authorName,
          tenantId: user.tenantId,
        });
      } catch (error) {
        if (isValidationError(error)) {
          return res.status(400).json({ error: 'Validation failed', issues: error.issues });
        }
        if (isDuplicateKeyError(error)) {
          return res.status(409).json({ error: 'A skill with this name already exists' });
        }
        throw error;
      }

      const { skill, warnings } = createResult;

      try {
        await grantPermission({
          principalType: PrincipalType.USER,
          principalId: user.id,
          resourceType: ResourceType.SKILL,
          resourceId: skill._id,
          accessRoleId: AccessRoleIds.SKILL_OWNER,
          grantedBy: user.id,
        });
      } catch (permissionError) {
        logger.error(
          `[POST /skills] Failed to grant owner permission for skill ${skill._id.toString()}, rolling back:`,
          permissionError,
        );
        try {
          await deleteSkill(skill._id.toString());
        } catch (rollbackError) {
          logger.error(
            `[POST /skills] Compensating delete failed for orphaned skill ${skill._id.toString()}:`,
            rollbackError,
          );
        }
        return res.status(500).json({ error: 'Failed to initialize skill permissions' });
      }

      // A freshly created skill has no PUBLIC ACL entry, so `isPublic` is
      // always false. Skip the DB round-trip.
      return res
        .status(201)
        .json(attachWarnings(serializeSkill(skill, new Set<string>()), warnings));
    } catch (error) {
      logger.error('[POST /skills] Error creating skill', error);
      return res.status(500).json({ error: 'Error creating skill' });
    }
  }

  async function getHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as { id: string };
      // The canAccessSkillResource middleware already resolved the skill via
      // getSkillById as its idResolver and stashed it on req.resourceAccess.resourceInfo.
      // Reuse it to avoid a second DB round-trip.
      const resolved = (
        req as ServerRequest & {
          resourceAccess?: { resourceInfo?: ISkill & { _id: Types.ObjectId } };
        }
      ).resourceAccess?.resourceInfo;
      const skill = resolved ?? (await getSkillById(id));
      if (!skill) {
        return res.status(404).json({ error: 'Skill not found' });
      }
      const publicSet = await getPublicSkillIdSet();
      return res.status(200).json(serializeSkill(skill, publicSet));
    } catch (error) {
      logger.error('[GET /skills/:id] Error fetching skill', error);
      return res.status(500).json({ error: 'Error fetching skill' });
    }
  }

  async function patchHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const body = (req.body ?? {}) as TUpdateSkillPayload & { expectedVersion?: number };
      const { expectedVersion, ...rest } = body;
      // `typeof NaN === 'number'` is true, so we need the stricter isFinite/isInteger
      // checks below to avoid NaN passing through and triggering a misleading 409
      // (MongoDB's `{ version: NaN }` never matches, so the handler would fall
      // through to the conflict branch and leak the current skill state).
      if (
        typeof expectedVersion !== 'number' ||
        !Number.isFinite(expectedVersion) ||
        !Number.isInteger(expectedVersion) ||
        expectedVersion < 1
      ) {
        return res
          .status(400)
          .json({ error: 'expectedVersion is required and must be a positive integer' });
      }

      const update: UpdateSkillInput = {};
      if (rest.name !== undefined) update.name = rest.name;
      if (rest.displayTitle !== undefined) update.displayTitle = rest.displayTitle;
      if (rest.description !== undefined) update.description = rest.description;
      if (rest.body !== undefined) update.body = rest.body;
      if (rest.frontmatter !== undefined) {
        update.frontmatter = rest.frontmatter as Record<string, unknown>;
      }
      if (rest.category !== undefined) update.category = rest.category;

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: 'At least one field must be provided for update' });
      }

      let result: UpdateSkillResult;
      try {
        result = await updateSkill({ id, expectedVersion, update });
      } catch (error) {
        if (isValidationError(error)) {
          return res.status(400).json({ error: 'Validation failed', issues: error.issues });
        }
        if (isDuplicateKeyError(error)) {
          return res.status(409).json({ error: 'A skill with this name already exists' });
        }
        throw error;
      }

      if (result.status === 'not_found') {
        return res.status(404).json({ error: 'Skill not found' });
      }
      const publicSet = await getPublicSkillIdSet();
      if (result.status === 'conflict') {
        const conflict: TSkillConflictResponse = {
          error: 'skill_version_conflict',
          current: serializeSkill(result.current, publicSet),
        };
        return res.status(409).json(conflict);
      }
      return res
        .status(200)
        .json(attachWarnings(serializeSkill(result.skill, publicSet), result.warnings));
    } catch (error) {
      logger.error('[PATCH /skills/:id] Error updating skill', error);
      return res.status(500).json({ error: 'Error updating skill' });
    }
  }

  async function deleteHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as { id: string };
      if (!isValidObjectIdString(id)) {
        return res.status(400).json({ error: 'Invalid skill id' });
      }
      const result = await deleteSkill(id);
      if (!result.deleted) {
        return res.status(404).json({ error: 'Skill not found' });
      }
      const response: TDeleteSkillResponse = { id, deleted: true };
      return res.status(200).json(response);
    } catch (error) {
      logger.error('[DELETE /skills/:id] Error deleting skill', error);
      return res.status(500).json({ error: 'Error deleting skill' });
    }
  }

  async function listFilesHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const rows = await listSkillFiles(id);
      const response: TListSkillFilesResponse = { files: rows.map(serializeSkillFile) };
      return res.status(200).json(response);
    } catch (error) {
      logger.error('[GET /skills/:id/files] Error listing skill files', error);
      return res.status(500).json({ error: 'Error listing skill files' });
    }
  }

  function uploadFileStubHandler(_req: ServerRequest, res: Response) {
    return res.status(501).json({
      error: 'skill_file_upload_not_implemented',
      phase: 2,
      message:
        'Skill file upload is not yet wired up. This endpoint is a stub reserved for phase 2.',
    });
  }

  function downloadFileStubHandler(_req: ServerRequest, res: Response) {
    return res.status(501).json({
      error: 'skill_file_download_not_implemented',
      phase: 2,
      message:
        'Skill file download is not yet wired up. This endpoint is a stub reserved for phase 2.',
    });
  }

  async function deleteFileHandler(req: ServerRequest, res: Response) {
    try {
      const { id, relativePath } = req.params as { id: string; relativePath: string };
      let decodedPath: string;
      try {
        decodedPath = decodeURIComponent(relativePath);
      } catch {
        return res.status(400).json({ error: 'Invalid file path encoding' });
      }
      const result = await deleteSkillFile(id, decodedPath);
      if (!result.deleted) {
        return res.status(404).json({ error: 'Skill file not found' });
      }
      const response: TDeleteSkillFileResponse = {
        skillId: id,
        relativePath: decodedPath,
        deleted: true,
      };
      return res.status(200).json(response);
    } catch (error) {
      logger.error('[DELETE /skills/:id/files/:relativePath] Error', error);
      return res.status(500).json({ error: 'Error deleting skill file' });
    }
  }

  return {
    list: listHandler,
    create: createHandler,
    get: getHandler,
    patch: patchHandler,
    delete: deleteHandler,
    listFiles: listFilesHandler,
    uploadFileStub: uploadFileStubHandler,
    downloadFileStub: downloadFileStubHandler,
    deleteFile: deleteFileHandler,
  };
}

export type SkillsHandlers = ReturnType<typeof createSkillsHandlers>;
