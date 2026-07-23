import { logger } from '@librechat/data-schemas';
import {
  ResourceType,
  AccessRoleIds,
  PrincipalType,
  PermissionBits,
  publishArtifactAppSchema,
  updateArtifactAppSchema,
  createArtifactVersionSchema,
} from 'librechat-data-provider';
import type {
  TArtifactApp,
  TArtifactVersion,
  ArtifactRuntimeType,
} from 'librechat-data-provider';
import type {
  IArtifactApp,
  IArtifactVersion,
  ArtifactAppQuery,
  ArtifactVersionQuery,
  ArtifactAppWithVersion,
  ArtifactAppIdResolution,
  CreateArtifactAppInput,
  CreateArtifactVersionInput,
  RecordAuditEntryInput,
  IAuditLog,
} from '@librechat/data-schemas';
import type { Response } from 'express';
import type { Types } from 'mongoose';
import type { ServerRequest } from '~/types';

/**
 * All dependencies required to serve Artifact App HTTP requests. Every dep is
 * resolved from the legacy api layer (`~/models`, `PermissionService`) so the
 * handlers stay pure — no direct mongoose access, no direct filesystem I/O.
 */
export interface ArtifactAppHandlersDeps {
  createArtifactAppWithVersion: (input: CreateArtifactAppInput) => Promise<ArtifactAppWithVersion>;
  getArtifactAppByAppId: (query: ArtifactAppQuery) => Promise<IArtifactApp | null>;
  resolveArtifactAppId: (query: ArtifactAppQuery) => Promise<ArtifactAppIdResolution | null>;
  listArtifactApps: (filter: Record<string, unknown>) => Promise<IArtifactApp[]>;
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

  findAccessibleResources: (params: {
    userId: string;
    role?: string | null;
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
  recordAuditEntry: (input: RecordAuditEntryInput) => Promise<IAuditLog | null>;
}

function toIso(value: Date | undefined): string {
  return (value ?? new Date()).toISOString();
}

function toIsoOptional(value: Date | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

function serializeApp(app: IArtifactApp): TArtifactApp {
  return {
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
  list: (req: ServerRequest, res: Response) => Promise<Response>;
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
    getArtifactAppByAppId,
    listArtifactApps,
    updateArtifactApp,
    deleteArtifactApp,
    getArtifactVersion,
    listArtifactVersions,
    createArtifactVersion,
    releaseArtifactVersion,
    activateArtifactVersion,
    withdrawArtifactVersion,
    findAccessibleResources,
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

  async function list(req: ServerRequest, res: Response) {
    try {
      const user = requireUser(req, res);
      if (!user) {
        return res as Response;
      }
      const accessibleIds = await findAccessibleResources({
        userId: user.id as string,
        role: user.role,
        resourceType: ResourceType.ARTIFACT_APP,
        requiredPermissions: PermissionBits.VIEW,
      });
      const apps = await listArtifactApps({ _id: { $in: accessibleIds } });
      return res.status(200).json({ apps: apps.map(serializeApp) });
    } catch (error) {
      logger.error('[GET /artifact-apps] Error listing artifact apps', error);
      return res.status(500).json({ error: 'Error listing artifact apps' });
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
    list,
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
