import { Types } from 'mongoose';
import { logger } from '@librechat/data-schemas';
import {
  ResourceType,
  AccessRoleIds,
  PrincipalType,
  PermissionBits,
  publishArtifactAppSchema,
  syncArtifactAppSchema,
  artifactAppListRequestSchema,
  updateArtifactAppSchema,
  createArtifactVersionSchema,
} from 'librechat-data-provider';
import type {
  IArtifactApp,
  IArtifactVersion,
  ArtifactAppQuery,
  ArtifactVersionQuery,
  ArtifactAppWithVersion,
  ArtifactAppIdResolution,
  ArtifactAppSourceQuery,
  SyncArtifactAppResult,
  CreateArtifactAppInput,
  CreateArtifactVersionInput,
  RecordAuditEntryInput,
  IAuditLog,
  ArtifactAppListCursor,
  ArtifactAppListOptions,
} from '@librechat/data-schemas';
import type { TArtifactApp, TArtifactVersion, ArtifactRuntimeType } from 'librechat-data-provider';
import type { FilterQuery } from 'mongoose';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';

const ARTIFACT_APP_SCAN_BATCH_SIZE = 100;
const ARTIFACT_APP_MAX_SCAN_BATCHES = 10;

/**
 * All dependencies required to serve Artifact App HTTP requests. Every dep is
 * resolved from the legacy api layer (`~/models`, `PermissionService`) so the
 * handlers stay pure — no direct mongoose access, no direct filesystem I/O.
 */
export interface ArtifactAppHandlersDeps {
  createArtifactAppWithVersion: (input: CreateArtifactAppInput) => Promise<ArtifactAppWithVersion>;
  syncArtifactAppWithVersion: (input: CreateArtifactAppInput) => Promise<SyncArtifactAppResult>;
  getArtifactAppByAppId: (query: ArtifactAppQuery) => Promise<IArtifactApp | null>;
  getArtifactAppBySource: (query: ArtifactAppSourceQuery) => Promise<IArtifactApp | null>;
  resolveArtifactAppId: (query: ArtifactAppQuery) => Promise<ArtifactAppIdResolution | null>;
  listArtifactApps: (
    filter: FilterQuery<IArtifactApp>,
    options?: ArtifactAppListOptions,
  ) => Promise<IArtifactApp[]>;
  updateArtifactApp: (
    query: ArtifactAppQuery,
    update: Partial<IArtifactApp>,
  ) => Promise<IArtifactApp | null>;
  deleteArtifactApp: (
    query: ArtifactAppQuery,
  ) => Promise<{ deletedApp: boolean; deletedVersions: number }>;
  getArtifactVersion: (query: ArtifactVersionQuery) => Promise<IArtifactVersion | null>;
  listArtifactVersions: (query: ArtifactAppQuery) => Promise<IArtifactVersion[]>;
  createArtifactVersion: (
    query: ArtifactAppQuery,
    input: CreateArtifactVersionInput,
  ) => Promise<IArtifactVersion>;
  releaseArtifactVersion: (
    query: ArtifactVersionQuery,
    releasedBy: string,
  ) => Promise<IArtifactVersion | null>;
  activateArtifactVersion: (query: ArtifactVersionQuery) => Promise<ArtifactAppWithVersion | null>;
  withdrawArtifactVersion: (query: ArtifactVersionQuery) => Promise<IArtifactVersion | null>;

  getResourcePermissionsMap: (params: {
    userId: string;
    role?: string | null;
    resourceType: string;
    resourceIds: Types.ObjectId[];
  }) => Promise<Map<string, number>>;
  grantPermission: (params: {
    principalType: string;
    principalId: string | Types.ObjectId;
    resourceType: string;
    resourceId: string | Types.ObjectId;
    accessRoleId: string;
    grantedBy: string | Types.ObjectId;
  }) => Promise<unknown>;
  recordAuditEntry: (input: RecordAuditEntryInput) => Promise<IAuditLog | null>;
}

function encodeListCursor(app: Pick<IArtifactApp, '_id' | 'updatedAt'>): string {
  return Buffer.from(
    JSON.stringify({
      updatedAt: app.updatedAt.toISOString(),
      _id: app._id.toString(),
    }),
  ).toString('base64');
}

function decodeListCursor(cursor: string | undefined): ArtifactAppListCursor | undefined {
  if (!cursor) {
    return undefined;
  }
  const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as {
    updatedAt?: string;
    _id?: string;
  };
  const updatedAt = decoded.updatedAt ? new Date(decoded.updatedAt) : null;
  if (
    !updatedAt ||
    Number.isNaN(updatedAt.getTime()) ||
    !decoded._id ||
    !Types.ObjectId.isValid(decoded._id)
  ) {
    throw new Error('Invalid artifact cursor');
  }
  return { updatedAt, _id: new Types.ObjectId(decoded._id) };
}

function toIso(value: Date | undefined): string {
  return (value ?? new Date()).toISOString();
}

function toIsoOptional(value: Date | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

function serializeApp(app: IArtifactApp): TArtifactApp {
  return {
    id: app._id.toString(),
    artifactAppId: app.artifactAppId,
    tenantId: app.tenantId,
    title: app.title,
    description: app.description,
    icon: app.icon,
    category: app.category,
    tags: app.tags,
    createdBy: app.createdBy,
    activeVersionId: app.activeVersionId,
    latestVersionNumber: app.latestVersionNumber,
    status: app.status,
    visibility: app.visibility,
    allowEmbed: app.allowEmbed,
    allowFork: app.allowFork,
    allowAnonymousView: app.allowAnonymousView,
    toolPolicy: {
      enabled: app.toolPolicy.enabled,
      allowedServers: app.toolPolicy.allowedServers,
      allowedTools: app.toolPolicy.allowedTools,
      requireConfirmationForWrites: app.toolPolicy.requireConfirmationForWrites,
    },
    marketplace: {
      listed: app.marketplace.listed,
      featured: app.marketplace.featured,
      summary: app.marketplace.summary,
      riskClass: app.marketplace.riskClass,
      costClass: app.marketplace.costClass,
    },
    sourceMetadata: app.sourceMetadata
      ? {
          conversationId: app.sourceMetadata.conversationId,
          messageId: app.sourceMetadata.messageId,
          originalArtifactId: app.sourceMetadata.originalArtifactId,
          sourceKey: app.sourceMetadata.sourceKey,
        }
      : undefined,
    review: app.review
      ? {
          submittedAt: toIsoOptional(app.review.submittedAt),
          submittedBy: app.review.submittedBy,
          reviewedAt: toIsoOptional(app.review.reviewedAt),
          reviewedBy: app.review.reviewedBy,
          result: app.review.result,
          comment: app.review.comment,
        }
      : undefined,
    createdAt: toIso(app.createdAt),
    updatedAt: toIso(app.updatedAt),
    archivedAt: toIsoOptional(app.archivedAt),
  };
}

function serializeVersion(version: IArtifactVersion): TArtifactVersion {
  const runtimeConfig = version.runtimeConfig ?? {};
  return {
    artifactVersionId: version.artifactVersionId,
    artifactAppId: version.artifactAppId,
    tenantId: version.tenantId,
    versionNumber: version.versionNumber,
    versionLabel: version.versionLabel,
    changelog: version.changelog,
    artifactType: version.artifactType,
    sourceSnapshot: version.sourceSnapshot,
    runtimeConfig: {
      dependencies: runtimeConfig.dependencies,
      entryPoint: runtimeConfig.entryPoint,
      renderMode: runtimeConfig.renderMode,
    },
    integrity: {
      sourceHash: version.integrity.sourceHash,
      schemaVersion: version.integrity.schemaVersion,
    },
    createdBy: version.createdBy,
    createdAt: toIso(version.createdAt),
    publication: {
      state: version.publication.state,
      releasedBy: version.publication.releasedBy,
      releasedAt: toIsoOptional(version.publication.releasedAt),
    },
  };
}

function requireUser(req: ServerRequest, res: Response): ServerRequest['user'] | null {
  const user = req.user;
  if (!user || !user.id) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  return user;
}

/**
 * Factory for the typed Express handlers served at `/api/artifact-apps`.
 * The legacy route file passes in concrete deps from `~/models` and
 * `PermissionService`; §8.7 mandates the server derives actor identity and
 * tenant strictly from the authenticated session, never from the request body.
 */
export function createArtifactAppHandlers(deps: ArtifactAppHandlersDeps): {
  publish: (req: ServerRequest, res: Response) => Promise<Response>;
  sync: (req: ServerRequest, res: Response) => Promise<Response>;
  list: (req: ServerRequest, res: Response) => Promise<Response>;
  getBySource: (req: ServerRequest, res: Response) => Promise<Response>;
  get: (req: ServerRequest, res: Response) => Promise<Response>;
  update: (req: ServerRequest, res: Response) => Promise<Response>;
  remove: (req: ServerRequest, res: Response) => Promise<Response>;
  listVersions: (req: ServerRequest, res: Response) => Promise<Response>;
  getVersion: (req: ServerRequest, res: Response) => Promise<Response>;
  createVersion: (req: ServerRequest, res: Response) => Promise<Response>;
  releaseVersion: (req: ServerRequest, res: Response) => Promise<Response>;
  activateVersion: (req: ServerRequest, res: Response) => Promise<Response>;
  withdrawVersion: (req: ServerRequest, res: Response) => Promise<Response>;
} {
  const {
    createArtifactAppWithVersion,
    syncArtifactAppWithVersion,
    getArtifactAppByAppId,
    getArtifactAppBySource,
    listArtifactApps,
    updateArtifactApp,
    deleteArtifactApp,
    getArtifactVersion,
    listArtifactVersions,
    createArtifactVersion,
    releaseArtifactVersion,
    activateArtifactVersion,
    withdrawArtifactVersion,
    getResourcePermissionsMap,
    grantPermission,
    recordAuditEntry,
  } = deps;

  function audit(input: RecordAuditEntryInput): void {
    recordAuditEntry(input).catch((err) =>
      logger.error(`[artifactApps] audit write failed for ${input.action}`, err),
    );
  }

  function toVersionInput(
    artifact: { type: ArtifactRuntimeType; content: string; runtimeConfig?: unknown },
    label: string | undefined,
    changelog: string | undefined,
    createdBy: string,
  ): CreateArtifactVersionInput {
    return {
      artifactType: artifact.type,
      sourceSnapshot: artifact.content,
      runtimeConfig: artifact.runtimeConfig as CreateArtifactVersionInput['runtimeConfig'],
      versionLabel: label,
      changelog,
      createdBy,
    };
  }

  async function publish(req: ServerRequest, res: Response) {
    try {
      const user = requireUser(req, res);
      if (!user) {
        return res as Response;
      }

      const parsed = publishArtifactAppSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues });
      }
      const data = parsed.data;

      const userId = user.id as string;
      const input: CreateArtifactAppInput = {
        tenantId: user.tenantId,
        createdBy: userId,
        title: data.title,
        description: data.description,
        icon: data.icon,
        category: data.category,
        tags: data.tags,
        visibility: data.visibility,
        allowEmbed: data.allowEmbed,
        allowFork: data.allowFork,
        allowAnonymousView: data.allowAnonymousView,
        toolPolicy: data.toolPolicy,
        marketplace: data.marketplace,
        sourceMetadata: data.source,
        version: toVersionInput(data.artifact, data.versionLabel, data.changelog, userId),
      };

      const { app, version } = await createArtifactAppWithVersion(input);

      try {
        await grantPermission({
          principalType: PrincipalType.USER,
          principalId: userId,
          resourceType: ResourceType.ARTIFACT_APP,
          resourceId: app._id as Types.ObjectId,
          accessRoleId: AccessRoleIds.ARTIFACT_APP_OWNER,
          grantedBy: userId,
        });
      } catch (permissionError) {
        logger.error(
          `[POST /artifact-apps] Failed to grant owner permission for ${app.artifactAppId}, rolling back:`,
          permissionError,
        );
        try {
          await deleteArtifactApp({ artifactAppId: app.artifactAppId });
        } catch (rollbackError) {
          logger.error(
            `[POST /artifact-apps] Compensating delete failed for ${app.artifactAppId}:`,
            rollbackError,
          );
        }
        return res.status(500).json({ error: 'Failed to initialize artifact app permissions' });
      }

      audit({
        tenantId: user.tenantId,
        action: 'artifact_app.created',
        actor: { type: 'user', id: userId, name: user.name ?? user.username ?? userId },
        target: { type: ResourceType.ARTIFACT_APP, id: app.artifactAppId, name: app.title },
        metadata: { versionNumber: version.versionNumber },
      });

      return res.status(201).json({ app: serializeApp(app), version: serializeVersion(version) });
    } catch (error) {
      logger.error('[POST /artifact-apps] Error publishing artifact app', error);
      return res.status(500).json({ error: 'Error publishing artifact app' });
    }
  }

  async function sync(req: ServerRequest, res: Response) {
    try {
      const user = requireUser(req, res);
      if (!user) {
        return res as Response;
      }
      const parsed = syncArtifactAppSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues });
      }

      const userId = user.id as string;
      const data = parsed.data;
      const result = await syncArtifactAppWithVersion({
        tenantId: user.tenantId,
        createdBy: userId,
        title: data.title,
        visibility: 'private',
        marketplace: { listed: true },
        sourceMetadata: data.source,
        version: toVersionInput(data.artifact, undefined, undefined, userId),
      });

      try {
        await grantPermission({
          principalType: PrincipalType.USER,
          principalId: userId,
          resourceType: ResourceType.ARTIFACT_APP,
          resourceId: result.app._id as Types.ObjectId,
          accessRoleId: AccessRoleIds.ARTIFACT_APP_OWNER,
          grantedBy: userId,
        });
      } catch (permissionError) {
        logger.error(
          `[POST /artifact-apps/sync] Failed to ensure owner permission for ${result.app.artifactAppId}:`,
          permissionError,
        );
        return res.status(500).json({ error: 'Failed to initialize artifact permissions' });
      }

      if (result.created || result.versionCreated) {
        audit({
          tenantId: user.tenantId,
          action: result.created ? 'artifact_app.created' : 'artifact_version.created',
          actor: { type: 'user', id: userId, name: user.name ?? user.username ?? userId },
          target: {
            type: ResourceType.ARTIFACT_APP,
            id: result.app.artifactAppId,
            name: result.app.title,
          },
          metadata: { versionNumber: result.version.versionNumber, automatic: true },
        });
      }

      return res.status(result.created ? 201 : 200).json({
        app: serializeApp(result.app),
        version: serializeVersion(result.version),
        created: result.created,
        versionCreated: result.versionCreated,
      });
    } catch (error) {
      logger.error('[POST /artifact-apps/sync] Error syncing artifact', error);
      return res.status(500).json({ error: 'Error syncing artifact' });
    }
  }

  async function list(req: ServerRequest, res: Response) {
    try {
      const user = requireUser(req, res);
      if (!user) {
        return res as Response;
      }
      const parsed = artifactAppListRequestSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid artifact list request' });
      }
      let scanCursor: ArtifactAppListCursor | undefined;
      try {
        scanCursor = decodeListCursor(parsed.data.cursor);
      } catch {
        return res.status(400).json({ error: 'Invalid artifact cursor' });
      }
      const userId = user.id as string;
      let ownershipFilter: FilterQuery<IArtifactApp> = {};
      if (parsed.data.scope === 'personal') {
        ownershipFilter = { createdBy: userId };
      } else if (parsed.data.scope === 'shared') {
        ownershipFilter = { createdBy: { $ne: userId } };
      }
      const accessibleApps: IArtifactApp[] = [];
      let exhausted = false;

      for (
        let batch = 0;
        batch < ARTIFACT_APP_MAX_SCAN_BATCHES && accessibleApps.length <= parsed.data.limit;
        batch++
      ) {
        const candidates = await listArtifactApps(ownershipFilter, {
          cursor: scanCursor,
          limit: ARTIFACT_APP_SCAN_BATCH_SIZE,
        });
        if (candidates.length === 0) {
          exhausted = true;
          break;
        }

        const permissions = await getResourcePermissionsMap({
          userId,
          role: user.role,
          resourceType: ResourceType.ARTIFACT_APP,
          resourceIds: candidates.map((app) => app._id),
        });
        for (const app of candidates) {
          const permissionBits = permissions.get(app._id.toString()) ?? 0;
          if ((permissionBits & PermissionBits.VIEW) === PermissionBits.VIEW) {
            accessibleApps.push(app);
            if (accessibleApps.length > parsed.data.limit) {
              break;
            }
          }
        }

        const lastCandidate = candidates[candidates.length - 1];
        if (lastCandidate) {
          scanCursor = { updatedAt: lastCandidate.updatedAt, _id: lastCandidate._id };
        }
        if (candidates.length < ARTIFACT_APP_SCAN_BATCH_SIZE) {
          exhausted = true;
          break;
        }
      }

      const apps = accessibleApps.slice(0, parsed.data.limit);
      const hasMore = accessibleApps.length > parsed.data.limit || !exhausted;
      const cursorApp =
        accessibleApps.length > parsed.data.limit ? apps[apps.length - 1] : undefined;
      const cursorSource = cursorApp ?? scanCursor;
      const after = hasMore && cursorSource ? encodeListCursor(cursorSource) : null;
      return res.status(200).json({
        apps: apps.map(serializeApp),
        has_more: hasMore,
        after,
      });
    } catch (error) {
      logger.error('[GET /artifact-apps] Error listing artifact apps', error);
      return res.status(500).json({ error: 'Error listing artifact apps' });
    }
  }

  async function getBySource(req: ServerRequest, res: Response) {
    try {
      const user = requireUser(req, res);
      if (!user) {
        return res as Response;
      }
      const conversationId =
        typeof req.query.conversationId === 'string' ? req.query.conversationId : '';
      const sourceKey = typeof req.query.sourceKey === 'string' ? req.query.sourceKey : '';
      if (!conversationId || !sourceKey) {
        return res.status(400).json({ error: 'conversationId and sourceKey are required' });
      }
      const app = await getArtifactAppBySource({
        tenantId: user.tenantId,
        createdBy: user.id as string,
        conversationId,
        sourceKey,
      });
      if (!app) {
        return res.status(404).json({ error: 'Artifact not found' });
      }
      const version = app.activeVersionId
        ? await getArtifactVersion({
            artifactAppId: app.artifactAppId,
            artifactVersionId: app.activeVersionId,
          })
        : null;
      return res.status(200).json({
        app: serializeApp(app),
        version: version ? serializeVersion(version) : null,
      });
    } catch (error) {
      logger.error('[GET /artifact-apps/source] Error fetching artifact', error);
      return res.status(500).json({ error: 'Error fetching artifact' });
    }
  }

  async function get(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const app = await getArtifactAppByAppId({ artifactAppId: id });
      if (!app) {
        return res.status(404).json({ error: 'Artifact app not found' });
      }
      const version = app.activeVersionId
        ? await getArtifactVersion({
            artifactAppId: app.artifactAppId,
            artifactVersionId: app.activeVersionId,
          })
        : null;
      return res.status(200).json({
        app: serializeApp(app),
        version: version ? serializeVersion(version) : null,
      });
    } catch (error) {
      logger.error('[GET /artifact-apps/:id] Error fetching artifact app', error);
      return res.status(500).json({ error: 'Error fetching artifact app' });
    }
  }

  async function update(req: ServerRequest, res: Response) {
    try {
      const user = requireUser(req, res);
      if (!user) {
        return res as Response;
      }
      const { id } = req.params as { id: string };
      const parsed = updateArtifactAppSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues });
      }
      if (Object.keys(parsed.data).length === 0) {
        return res.status(400).json({ error: 'At least one field must be provided for update' });
      }

      const updated = await updateArtifactApp(
        { artifactAppId: id },
        parsed.data as Partial<IArtifactApp>,
      );
      if (!updated) {
        return res.status(404).json({ error: 'Artifact app not found' });
      }
      audit({
        tenantId: user.tenantId,
        action: 'artifact_app.updated',
        actor: { type: 'user', id: user.id as string, name: user.name ?? user.username ?? '' },
        target: { type: ResourceType.ARTIFACT_APP, id: updated.artifactAppId, name: updated.title },
      });
      return res.status(200).json(serializeApp(updated));
    } catch (error) {
      logger.error('[PATCH /artifact-apps/:id] Error updating artifact app', error);
      return res.status(500).json({ error: 'Error updating artifact app' });
    }
  }

  async function remove(req: ServerRequest, res: Response) {
    try {
      const user = requireUser(req, res);
      if (!user) {
        return res as Response;
      }
      const { id } = req.params as { id: string };
      const result = await deleteArtifactApp({ artifactAppId: id });
      if (!result.deletedApp) {
        return res.status(404).json({ error: 'Artifact app not found' });
      }
      audit({
        tenantId: user.tenantId,
        action: 'artifact_app.archived',
        actor: { type: 'user', id: user.id as string, name: user.name ?? user.username ?? '' },
        target: { type: ResourceType.ARTIFACT_APP, id },
        metadata: { deletedVersions: result.deletedVersions },
      });
      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error('[DELETE /artifact-apps/:id] Error deleting artifact app', error);
      return res.status(500).json({ error: 'Error deleting artifact app' });
    }
  }

  async function listVersions(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const versions = await listArtifactVersions({ artifactAppId: id });
      return res.status(200).json({ versions: versions.map(serializeVersion) });
    } catch (error) {
      logger.error('[GET /artifact-apps/:id/versions] Error listing versions', error);
      return res.status(500).json({ error: 'Error listing artifact app versions' });
    }
  }

  async function getVersion(req: ServerRequest, res: Response) {
    try {
      const { id, versionId } = req.params as { id: string; versionId: string };
      const version = await getArtifactVersion({
        artifactAppId: id,
        artifactVersionId: versionId,
      });
      if (!version) {
        return res.status(404).json({ error: 'Artifact version not found' });
      }
      return res.status(200).json(serializeVersion(version));
    } catch (error) {
      logger.error('[GET /artifact-apps/:id/versions/:versionId] Error fetching version', error);
      return res.status(500).json({ error: 'Error fetching artifact app version' });
    }
  }

  async function createVersion(req: ServerRequest, res: Response) {
    try {
      const user = requireUser(req, res);
      if (!user) {
        return res as Response;
      }
      const { id } = req.params as { id: string };
      const parsed = createArtifactVersionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues });
      }
      const data = parsed.data;
      let version: IArtifactVersion;
      try {
        version = await createArtifactVersion(
          { artifactAppId: id },
          toVersionInput(data.artifact, data.versionLabel, data.changelog, user.id as string),
        );
      } catch (error) {
        if ((error as Error).message?.includes('not found')) {
          return res.status(404).json({ error: 'Artifact app not found' });
        }
        throw error;
      }
      audit({
        tenantId: user.tenantId,
        action: 'artifact_version.created',
        actor: { type: 'user', id: user.id as string, name: user.name ?? user.username ?? '' },
        target: { type: ResourceType.ARTIFACT_APP, id, name: version.artifactVersionId },
        metadata: { versionNumber: version.versionNumber },
      });
      return res.status(201).json(serializeVersion(version));
    } catch (error) {
      logger.error('[POST /artifact-apps/:id/versions] Error creating version', error);
      return res.status(500).json({ error: 'Error creating artifact app version' });
    }
  }

  async function releaseVersion(req: ServerRequest, res: Response) {
    try {
      const user = requireUser(req, res);
      if (!user) {
        return res as Response;
      }
      const { id, versionId } = req.params as { id: string; versionId: string };
      const version = await releaseArtifactVersion(
        { artifactAppId: id, artifactVersionId: versionId },
        user.id as string,
      );
      if (!version) {
        return res.status(404).json({ error: 'Artifact version not found' });
      }
      audit({
        tenantId: user.tenantId,
        action: 'artifact_version.released',
        actor: { type: 'user', id: user.id as string, name: user.name ?? user.username ?? '' },
        target: { type: ResourceType.ARTIFACT_APP, id, name: version.artifactVersionId },
        metadata: { versionNumber: version.versionNumber },
      });
      return res.status(200).json(serializeVersion(version));
    } catch (error) {
      logger.error('[POST /artifact-apps/:id/versions/:versionId/release] Error', error);
      return res.status(500).json({ error: 'Error releasing artifact app version' });
    }
  }

  async function activateVersion(req: ServerRequest, res: Response) {
    try {
      const user = requireUser(req, res);
      if (!user) {
        return res as Response;
      }
      const { id, versionId } = req.params as { id: string; versionId: string };
      let result: ArtifactAppWithVersion | null;
      try {
        result = await activateArtifactVersion({
          artifactAppId: id,
          artifactVersionId: versionId,
        });
      } catch (error) {
        if ((error as Error).message?.includes('released')) {
          return res.status(409).json({ error: 'Only released versions can be activated' });
        }
        throw error;
      }
      if (!result) {
        return res.status(404).json({ error: 'Artifact version not found' });
      }
      audit({
        tenantId: user.tenantId,
        action: 'artifact_version.activated',
        actor: { type: 'user', id: user.id as string, name: user.name ?? user.username ?? '' },
        target: { type: ResourceType.ARTIFACT_APP, id, name: result.version.artifactVersionId },
        metadata: { versionNumber: result.version.versionNumber },
      });
      return res.status(200).json(serializeApp(result.app));
    } catch (error) {
      logger.error('[POST /artifact-apps/:id/versions/:versionId/activate] Error', error);
      return res.status(500).json({ error: 'Error activating artifact app version' });
    }
  }

  async function withdrawVersion(req: ServerRequest, res: Response) {
    try {
      const user = requireUser(req, res);
      if (!user) {
        return res as Response;
      }
      const { id, versionId } = req.params as { id: string; versionId: string };
      const version = await withdrawArtifactVersion({
        artifactAppId: id,
        artifactVersionId: versionId,
      });
      if (!version) {
        return res.status(404).json({ error: 'Artifact version not found' });
      }
      audit({
        tenantId: user.tenantId,
        action: 'artifact_version.withdrawn',
        actor: { type: 'user', id: user.id as string, name: user.name ?? user.username ?? '' },
        target: { type: ResourceType.ARTIFACT_APP, id, name: version.artifactVersionId },
        metadata: { versionNumber: version.versionNumber },
      });
      return res.status(200).json(serializeVersion(version));
    } catch (error) {
      logger.error('[POST /artifact-apps/:id/versions/:versionId/withdraw] Error', error);
      return res.status(500).json({ error: 'Error withdrawing artifact app version' });
    }
  }

  return {
    publish,
    sync,
    list,
    getBySource,
    get,
    update,
    remove,
    listVersions,
    getVersion,
    createVersion,
    releaseVersion,
    activateVersion,
    withdrawVersion,
  };
}

export type ArtifactAppHandlers = ReturnType<typeof createArtifactAppHandlers>;
