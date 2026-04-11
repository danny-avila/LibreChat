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
  CreateSkillInput,
  UpdateSkillInput,
  ListSkillsByAccessResult,
  UpdateSkillResult,
  ValidationIssue,
} from '@librechat/data-schemas';
import type {
  TSkill,
  TSkillFile,
  TSkillSummary,
  TCreateSkill,
  TUpdateSkillPayload,
  TListSkillFilesResponse,
  TDeleteSkillResponse,
  TDeleteSkillFileResponse,
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
  createSkill: (data: CreateSkillInput) => Promise<ISkill & { _id: Types.ObjectId }>;
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

/** Sentinel used by the PATCH stub for an invalid `expectedVersion`. */
const EXPECTED_VERSION_ERROR = 'expectedVersion is required and must be a number';

/** Converts a skill document to the wire format returned by the API. */
function serializeSkill(skill: ISkill & { _id: Types.ObjectId }, publicSet: Set<string>): TSkill {
  return {
    _id: skill._id.toString(),
    name: skill.name,
    displayTitle: skill.displayTitle,
    description: skill.description,
    body: skill.body,
    frontmatter: skill.frontmatter as TSkill['frontmatter'],
    category: skill.category,
    author: skill.author.toString(),
    authorName: skill.authorName,
    version: skill.version,
    source: skill.source,
    sourceMetadata: skill.sourceMetadata as TSkill['sourceMetadata'],
    fileCount: skill.fileCount,
    isPublic: publicSet.has(skill._id.toString()),
    tenantId: skill.tenantId,
    createdAt: (skill.createdAt ?? new Date()).toISOString(),
    updatedAt: (skill.updatedAt ?? new Date()).toISOString(),
  };
}

function serializeSkillSummary(
  skill: ISkill & { _id: Types.ObjectId },
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
    sourceMetadata: skill.sourceMetadata as TSkill['sourceMetadata'],
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

      let skill: ISkill & { _id: Types.ObjectId };
      try {
        skill = await createSkill({
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
          `[POST /skills] Failed to grant owner permission for skill ${skill._id.toString()}:`,
          permissionError,
        );
      }

      const publicSet = await getPublicSkillIdSet();
      return res.status(201).json(serializeSkill(skill, publicSet));
    } catch (error) {
      logger.error('[POST /skills] Error creating skill', error);
      return res.status(500).json({ error: 'Error creating skill' });
    }
  }

  async function getHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const skill = await getSkillById(id);
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
      if (typeof expectedVersion !== 'number') {
        return res.status(400).json({ error: EXPECTED_VERSION_ERROR });
      }

      const update: UpdateSkillInput = {
        name: rest.name,
        displayTitle: rest.displayTitle,
        description: rest.description,
        body: rest.body,
        frontmatter: rest.frontmatter as Record<string, unknown> | undefined,
        category: rest.category,
      };

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
        return res.status(409).json({
          error: 'skill_version_conflict',
          current: serializeSkill(result.current, publicSet),
        });
      }
      return res.status(200).json(serializeSkill(result.skill, publicSet));
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
      const decodedPath = decodeURIComponent(relativePath);
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
