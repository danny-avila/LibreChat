import type { ClientSession } from 'mongoose';
import mongoose from 'mongoose';
import { PrincipalType } from 'librechat-data-provider';
import {
  DEFAULT_MIGRATION_SCOPES,
  getTransactionSupport,
  isValidObjectIdString,
  logger,
  runAsSystem,
} from '@librechat/data-schemas';
import type {
  CollectionMigrationResult,
  CreateAuditEntryInput,
  IUser,
  MigrationScope,
  UserMigratedAuditMetadata,
} from '@librechat/data-schemas';
import type { FilterQuery } from 'mongoose';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';

interface MigrationRequestBody {
  sourceUserId?: string;
  targetUserId?: string;
  scopes?: MigrationScope[];
}

export interface AdminMigrationsDeps {
  findUser: (filter: FilterQuery<IUser>) => Promise<IUser | null>;
  countUserData: (params: {
    sourceUserId: string;
    scopes: MigrationScope[];
  }) => Promise<Record<MigrationScope, number>>;
  reassignUserData: (params: {
    sourceUserId: string;
    targetUserId: string;
    targetTenantId: string;
    scopes: MigrationScope[];
    session?: ClientSession;
  }) => Promise<CollectionMigrationResult[]>;
  createAuditEntry: (input: CreateAuditEntryInput) => Promise<unknown>;
  getTransactionSupport: typeof getTransactionSupport;
}

function resolveActorId(req: ServerRequest): string | null {
  const user = req.user;
  if (!user) {
    return null;
  }
  return user._id?.toString() ?? user.id ?? null;
}

function normalizeScopes(scopes: MigrationScope[] | undefined): MigrationScope[] {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return [...DEFAULT_MIGRATION_SCOPES];
  }
  return scopes;
}

function summarizeResults(results: CollectionMigrationResult[]): {
  counts: Record<string, number>;
  skipped: Record<string, number>;
  totalModified: number;
  totalSkipped: number;
} {
  const counts: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  let totalModified = 0;
  let totalSkipped = 0;

  for (const result of results) {
    counts[result.scopeKey] = result.modified;
    if (result.skipped > 0) {
      skipped[result.scopeKey] = result.skipped;
    }
    totalModified += result.modified;
    totalSkipped += result.skipped;
  }

  return { counts, skipped, totalModified, totalSkipped };
}

export function createAdminMigrationsHandlers(deps: AdminMigrationsDeps) {
  const {
    findUser,
    countUserData,
    reassignUserData,
    createAuditEntry,
    getTransactionSupport: getTxSupport,
  } = deps;

  let transactionSupportCache: boolean | null = null;

  async function loadUsers(sourceUserId: string, targetUserId: string) {
    if (!isValidObjectIdString(sourceUserId) || !isValidObjectIdString(targetUserId)) {
      return { error: 'Invalid user ID format' as const };
    }
    if (sourceUserId === targetUserId) {
      return { error: 'Source and target users must be different' as const };
    }

    const [sourceUser, targetUser] = await runAsSystem(() =>
      Promise.all([findUser({ _id: sourceUserId }), findUser({ _id: targetUserId })]),
    );

    if (!sourceUser) {
      return { error: 'Source user not found' as const };
    }
    if (!targetUser) {
      return { error: 'Target user not found' as const };
    }

    const targetTenantId = targetUser.tenantId?.trim();
    if (!targetTenantId) {
      return { error: 'Target user has no tenant assignment' as const };
    }

    const sourceTenantId = sourceUser.tenantId?.trim() ?? '';
    const crossTenant = sourceTenantId !== targetTenantId;

    return {
      sourceUser,
      targetUser,
      targetTenantId,
      crossTenant,
    };
  }

  async function previewMigrationHandler(req: ServerRequest, res: Response) {
    try {
      const { sourceUserId, targetUserId, scopes } = req.body as MigrationRequestBody;
      if (!sourceUserId || !targetUserId) {
        return res.status(400).json({ error: 'sourceUserId and targetUserId are required' });
      }

      const loaded = await loadUsers(sourceUserId, targetUserId);
      if ('error' in loaded) {
        const status =
          loaded.error === 'Source user not found' || loaded.error === 'Target user not found'
            ? 404
            : 400;
        return res.status(status).json({ error: loaded.error });
      }

      const normalizedScopes = normalizeScopes(scopes);
      const counts = await runAsSystem(() =>
        countUserData({ sourceUserId, scopes: normalizedScopes }),
      );

      return res.status(200).json({
        crossTenant: loaded.crossTenant,
        sourceUser: {
          id: String(loaded.sourceUser._id),
          email: loaded.sourceUser.email,
          name: loaded.sourceUser.name,
          tenantId: loaded.sourceUser.tenantId,
        },
        targetUser: {
          id: String(loaded.targetUser._id),
          email: loaded.targetUser.email,
          name: loaded.targetUser.name,
          tenantId: loaded.targetUser.tenantId,
        },
        counts,
        scopes: normalizedScopes,
      });
    } catch (error) {
      logger.error('[adminMigrations] previewMigration error:', error);
      return res.status(500).json({ error: 'Failed to preview migration' });
    }
  }

  async function migrateUserHandler(req: ServerRequest, res: Response) {
    try {
      const actorId = resolveActorId(req);
      if (!actorId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { sourceUserId, targetUserId, scopes } = req.body as MigrationRequestBody;
      if (!sourceUserId || !targetUserId) {
        return res.status(400).json({ error: 'sourceUserId and targetUserId are required' });
      }

      const loaded = await loadUsers(sourceUserId, targetUserId);
      if ('error' in loaded) {
        const status =
          loaded.error === 'Source user not found' || loaded.error === 'Target user not found'
            ? 404
            : 400;
        return res.status(status).json({ error: loaded.error });
      }

      const normalizedScopes = normalizeScopes(scopes);
      const txSupported = await getTxSupport(mongoose, transactionSupportCache);
      transactionSupportCache = txSupported;
      let results: CollectionMigrationResult[] = [];

      if (txSupported) {
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            results = await runAsSystem(() =>
              reassignUserData({
                sourceUserId,
                targetUserId,
                targetTenantId: loaded.targetTenantId,
                scopes: normalizedScopes,
                session,
              }),
            );
          });
        } finally {
          await session.endSession();
        }
      } else {
        results = await runAsSystem(() =>
          reassignUserData({
            sourceUserId,
            targetUserId,
            targetTenantId: loaded.targetTenantId,
            scopes: normalizedScopes,
          }),
        );
      }

      const summary = summarizeResults(results);
      const metadata: UserMigratedAuditMetadata = {
        sourceUserId,
        sourceEmail: loaded.sourceUser.email,
        targetUserId,
        targetEmail: loaded.targetUser.email,
        crossTenant: loaded.crossTenant,
        counts: summary.counts,
        skipped: summary.skipped,
      };

      await runAsSystem(() =>
        createAuditEntry({
          action: 'user_migrated',
          actorId,
          targetPrincipalType: PrincipalType.USER,
          targetPrincipalId: targetUserId,
          targetName: loaded.targetUser.email ?? loaded.targetUser.name,
          metadata,
          tenantId: loaded.targetTenantId,
        }),
      );

      return res.status(200).json({
        crossTenant: loaded.crossTenant,
        results,
        totalModified: summary.totalModified,
        totalSkipped: summary.totalSkipped,
      });
    } catch (error) {
      logger.error('[adminMigrations] migrateUser error:', error);
      return res.status(500).json({ error: 'Failed to migrate user data' });
    }
  }

  return {
    previewMigration: previewMigrationHandler,
    migrateUser: migrateUserHandler,
  };
}
