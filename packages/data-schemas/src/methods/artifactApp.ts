import { nanoid } from 'nanoid';
import crypto from 'node:crypto';
import { ARTIFACT_SOURCE_KEY_PREFIX, DEFAULT_ARTIFACT_APPS_CONFIG } from 'librechat-data-provider';
import type { ClientSession, FilterQuery, Model, Types } from 'mongoose';
import type {
  IArtifactApp,
  IArtifactVersion,
  ArtifactAppQuery,
  ArtifactVersionQuery,
  CreateArtifactAppInput,
  CreateArtifactVersionInput,
  ArtifactAppWithVersion,
  ArtifactAppSourceQuery,
  SyncArtifactAppResult,
  IArtifactVersionRuntimeConfig,
  ArtifactAppListOptions,
  ArtifactAppListPage,
  ArtifactAppRecord,
  ArtifactAppUpdate,
  ArtifactAppSyncOptions,
  ArtifactVersionRecord,
  ArtifactVersionListOptions,
  ArtifactVersionListPage,
  ArtifactVersionSummaryRecord,
  ArtifactAppDeletionResult,
} from '~/types';
import { supportsTransactions } from '~/utils/transactions';
import { escapeRegExp } from '~/utils/string';

/** Snapshot schema version — bump when the canonical snapshot shape changes. */
export const ARTIFACT_SCHEMA_VERSION = 1;

interface MongoWriteError {
  code?: number;
  errorLabels?: string[];
}

interface ArtifactAppIdentityRecord {
  _id: Types.ObjectId;
  status?: string;
  deletion?: { requestedBy: string };
  updatedAt?: Date;
  sourceMetadata?: { sourceKey?: string };
}

class ArtifactSyncRetryError extends Error {}

export class ArtifactAppDeletedError extends Error {
  constructor() {
    super('Artifact app source has been deleted');
    this.name = 'ArtifactAppDeletedError';
  }
}

function getLegacySourceKey(sourceKey: string): string | null {
  return sourceKey.startsWith(ARTIFACT_SOURCE_KEY_PREFIX)
    ? sourceKey.slice(ARTIFACT_SOURCE_KEY_PREFIX.length)
    : null;
}

function legacyTypedSourceKeyPattern(sourceKey: string): RegExp | null {
  if (!sourceKey.startsWith('identifier:')) {
    return null;
  }
  return new RegExp(`^${escapeRegExp(sourceKey)}:(?:application|text|image)/[^:]+$`);
}

function isRetryableWriteError(error: unknown): boolean {
  const writeError = error as MongoWriteError;
  return (
    error instanceof ArtifactSyncRetryError ||
    writeError.code === 11000 ||
    writeError.code === 112 ||
    writeError.errorLabels?.includes('TransientTransactionError') === true
  );
}

function waitForSyncLock(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Deterministic SHA-256 over the canonical version payload
 * ({ artifactType, sourceSnapshot, runtimeConfig }). Keys are sorted so the
 * hash is stable regardless of property insertion order.
 */
export function computeSourceHash(
  artifactType: string,
  sourceSnapshot: string,
  runtimeConfig: IArtifactVersionRuntimeConfig = {},
): string {
  const canonical = JSON.stringify({
    artifactType,
    sourceSnapshot,
    runtimeConfig: canonicalize(runtimeConfig),
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.keys(source)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalize(source[key]);
        return acc;
      }, {});
  }
  return value;
}

export interface ArtifactAppMethods {
  createArtifactAppWithVersion: (input: CreateArtifactAppInput) => Promise<ArtifactAppWithVersion>;
  syncArtifactAppWithVersion: (
    input: CreateArtifactAppInput,
    options?: Partial<ArtifactAppSyncOptions>,
  ) => Promise<SyncArtifactAppResult>;
  getArtifactAppByAppId: (query: ArtifactAppQuery) => Promise<ArtifactAppRecord | null>;
  getArtifactAppBySource: (query: ArtifactAppSourceQuery) => Promise<ArtifactAppRecord | null>;
  resolveArtifactAppId: (query: ArtifactAppQuery) => Promise<string | null>;
  listArtifactApps: (options: ArtifactAppListOptions) => Promise<ArtifactAppListPage>;
  updateArtifactApp: (
    query: ArtifactAppQuery,
    update: ArtifactAppUpdate,
  ) => Promise<ArtifactAppRecord | null>;
  deleteArtifactApp: (
    query: ArtifactAppQuery,
  ) => Promise<{ deletedApp: boolean; deletedVersions: number }>;
  prepareArtifactAppDeletion: (
    query: ArtifactAppQuery,
    requestedBy: string,
  ) => Promise<ArtifactAppDeletionResult>;
  finalizeArtifactAppDeletion: (query: ArtifactAppQuery, requestedBy: string) => Promise<boolean>;
  getArtifactVersion: (query: ArtifactVersionQuery) => Promise<ArtifactVersionRecord | null>;
  listArtifactVersions: (options: ArtifactVersionListOptions) => Promise<ArtifactVersionListPage>;
  releaseArtifactVersion: (
    query: ArtifactVersionQuery,
    releasedBy: string,
  ) => Promise<ArtifactVersionRecord | null>;
  activateArtifactVersion: (query: ArtifactVersionQuery) => Promise<ArtifactAppWithVersion | null>;
  withdrawArtifactVersion: (query: ArtifactVersionQuery) => Promise<ArtifactVersionRecord | null>;
}

function buildVersionFilter(query: ArtifactVersionQuery): Record<string, unknown> {
  const filter: Record<string, unknown> = { artifactAppId: query.artifactAppId };
  if (query.artifactVersionId) {
    filter.artifactVersionId = query.artifactVersionId;
  }
  if (typeof query.versionNumber === 'number') {
    filter.versionNumber = query.versionNumber;
  }
  return filter;
}

export function createArtifactAppMethods(mongoose: typeof import('mongoose')): ArtifactAppMethods {
  const getApp = () => mongoose.models.ArtifactApp as Model<IArtifactApp>;
  const getVersion = () => mongoose.models.ArtifactVersion as Model<IArtifactVersion>;

  function toAppRecord(app: IArtifactApp): ArtifactAppRecord {
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
      toolPolicy: app.toolPolicy,
      marketplace: app.marketplace,
      sourceMetadata: app.sourceMetadata,
      deletion: app.deletion,
      review: app.review,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      archivedAt: app.archivedAt,
    };
  }

  function toVersionRecord(version: IArtifactVersion): ArtifactVersionRecord {
    return {
      artifactVersionId: version.artifactVersionId,
      artifactAppId: version.artifactAppId,
      tenantId: version.tenantId,
      versionNumber: version.versionNumber,
      versionLabel: version.versionLabel,
      changelog: version.changelog,
      artifactType: version.artifactType,
      sourceSnapshot: version.sourceSnapshot,
      runtimeConfig: version.runtimeConfig,
      integrity: version.integrity,
      createdBy: version.createdBy,
      createdAt: version.createdAt,
      publication: version.publication,
    };
  }

  function toVersionSummary(version: IArtifactVersion): ArtifactVersionSummaryRecord {
    return {
      artifactVersionId: version.artifactVersionId,
      artifactAppId: version.artifactAppId,
      tenantId: version.tenantId,
      versionNumber: version.versionNumber,
      versionLabel: version.versionLabel,
      changelog: version.changelog,
      artifactType: version.artifactType,
      createdBy: version.createdBy,
      createdAt: version.createdAt,
      publication: version.publication,
    };
  }

  function encodeAppCursor(app: IArtifactApp): string {
    return Buffer.from(
      JSON.stringify({ updatedAt: app.updatedAt.toISOString(), id: app._id.toString() }),
    ).toString('base64');
  }

  function decodeAppCursor(cursor: string): { updatedAt: Date; id: Types.ObjectId } {
    let parsed: { updatedAt?: string; id?: string };
    try {
      parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as {
        updatedAt?: string;
        id?: string;
      };
    } catch {
      throw new Error('Invalid artifact app cursor');
    }
    const updatedAt = parsed.updatedAt ? new Date(parsed.updatedAt) : null;
    if (
      !updatedAt ||
      Number.isNaN(updatedAt.getTime()) ||
      !parsed.id ||
      !mongoose.Types.ObjectId.isValid(parsed.id)
    ) {
      throw new Error('Invalid artifact app cursor');
    }
    return { updatedAt, id: new mongoose.Types.ObjectId(parsed.id) };
  }

  function encodeVersionCursor(versionNumber: number): string {
    return Buffer.from(JSON.stringify({ versionNumber })).toString('base64');
  }

  function decodeVersionCursor(cursor: string): number {
    let parsed: { versionNumber?: number };
    try {
      parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as {
        versionNumber?: number;
      };
    } catch {
      throw new Error('Invalid artifact version cursor');
    }
    const versionNumber = parsed.versionNumber;
    if (
      typeof versionNumber !== 'number' ||
      !Number.isInteger(versionNumber) ||
      versionNumber < 1
    ) {
      throw new Error('Invalid artifact version cursor');
    }
    return versionNumber;
  }

  function buildVersionDoc(
    artifactAppId: string,
    tenantId: string | undefined,
    versionNumber: number,
    input: CreateArtifactVersionInput,
    state: 'draft' | 'released',
  ): Partial<IArtifactVersion> {
    const runtimeConfig = input.runtimeConfig ?? {};
    return {
      artifactVersionId: `ver_${nanoid()}`,
      artifactAppId,
      tenantId,
      versionNumber,
      versionLabel: input.versionLabel,
      changelog: input.changelog,
      artifactType: input.artifactType,
      sourceSnapshot: input.sourceSnapshot,
      runtimeConfig,
      integrity: {
        sourceHash: computeSourceHash(input.artifactType, input.sourceSnapshot, runtimeConfig),
        schemaVersion: ARTIFACT_SCHEMA_VERSION,
      },
      createdBy: input.createdBy,
      publication: {
        state,
        ...(state === 'released' ? { releasedBy: input.createdBy, releasedAt: new Date() } : {}),
      },
    } as Partial<IArtifactVersion>;
  }

  async function createArtifactAppWithVersion(
    input: CreateArtifactAppInput,
  ): Promise<ArtifactAppWithVersion> {
    const ArtifactApp = getApp();
    const ArtifactVersion = getVersion();
    const artifactAppId = `app_${nanoid()}`;

    const appDoc: Partial<IArtifactApp> = {
      artifactAppId,
      tenantId: input.tenantId,
      title: input.title,
      description: input.description,
      icon: input.icon,
      category: input.category,
      tags: input.tags,
      createdBy: input.createdBy,
      latestVersionNumber: 1,
      status: 'draft',
      visibility: input.visibility,
      allowEmbed: input.allowEmbed ?? false,
      allowFork: input.allowFork ?? false,
      allowAnonymousView: input.allowAnonymousView ?? false,
      toolPolicy: input.toolPolicy as IArtifactApp['toolPolicy'],
      marketplace: input.marketplace as IArtifactApp['marketplace'],
      sourceMetadata: input.sourceMetadata,
    };

    const versionSeed = buildVersionDoc(artifactAppId, input.tenantId, 1, input.version, 'draft');
    const activeVersionId = versionSeed.artifactVersionId;
    if (!activeVersionId) {
      throw new Error('[createArtifactAppWithVersion] Version seed has no identifier');
    }
    appDoc.activeVersionId = activeVersionId;

    const useTransaction = await supportsTransactions(mongoose);

    if (!useTransaction) {
      const [version] = await ArtifactVersion.create([versionSeed]);
      try {
        const [app] = await ArtifactApp.create([appDoc]);
        return { app: toAppRecord(app), version: toVersionRecord(version) };
      } catch (error) {
        await ArtifactVersion.deleteOne({ artifactVersionId: version.artifactVersionId }).exec();
        throw error;
      }
    }

    const session: ClientSession = await mongoose.startSession();
    try {
      let result: ArtifactAppWithVersion | undefined;
      await session.withTransaction(async () => {
        const [app] = await ArtifactApp.create([appDoc], { session });
        const [version] = await ArtifactVersion.create([versionSeed], { session });
        result = { app: toAppRecord(app), version: toVersionRecord(version) };
      });
      if (!result) {
        throw new Error('[createArtifactAppWithVersion] Transaction produced no result');
      }
      return result;
    } finally {
      await session.endSession();
    }
  }

  async function getArtifactAppByAppId(query: ArtifactAppQuery): Promise<ArtifactAppRecord | null> {
    const app = await getApp()
      .findOne({ artifactAppId: query.artifactAppId })
      .lean<IArtifactApp>()
      .exec();
    return app ? toAppRecord(app) : null;
  }

  function buildSourceOwnerFilter(query: ArtifactAppSourceQuery): FilterQuery<IArtifactApp> {
    const filter: FilterQuery<IArtifactApp> = {
      createdBy: query.createdBy,
      'sourceMetadata.conversationId': query.conversationId,
    };
    if (query.tenantId != null) {
      filter.tenantId = query.tenantId;
    } else {
      filter.tenantId = { $exists: false };
    }
    return filter;
  }

  function buildSourceFilter(query: ArtifactAppSourceQuery): FilterQuery<IArtifactApp> {
    return {
      ...buildSourceOwnerFilter(query),
      'sourceMetadata.sourceKey': query.sourceKey,
    };
  }

  async function getArtifactAppBySource(
    query: ArtifactAppSourceQuery,
  ): Promise<ArtifactAppRecord | null> {
    const currentFilter = {
      ...buildSourceFilter(query),
      deletion: { $exists: false },
      status: { $ne: 'archived' },
    };
    let app = await getApp().findOne(currentFilter).lean<IArtifactApp>().exec();
    const legacySourceKey = getLegacySourceKey(query.sourceKey);
    if (!app && legacySourceKey) {
      const legacyPattern = legacyTypedSourceKeyPattern(legacySourceKey);
      const sourceKeyFilter = legacyPattern
        ? {
            $or: [
              { 'sourceMetadata.sourceKey': legacySourceKey },
              { 'sourceMetadata.sourceKey': legacyPattern },
            ],
          }
        : { 'sourceMetadata.sourceKey': legacySourceKey };
      app = await getApp()
        .findOne({
          ...buildSourceOwnerFilter(query),
          ...sourceKeyFilter,
          deletion: { $exists: false },
          status: { $ne: 'archived' },
        })
        .sort({ updatedAt: -1, _id: -1 })
        .lean<IArtifactApp>()
        .exec();
    }
    return app ? toAppRecord(app) : null;
  }

  /**
   * Creates the catalog record once, then appends and activates a new snapshot
   * only when its canonical content hash changes. Version history remains in
   * the separate ArtifactVersion collection so it can grow independently.
   */
  async function syncArtifactAppWithVersion(
    input: CreateArtifactAppInput,
    options: Partial<ArtifactAppSyncOptions> = {},
  ): Promise<SyncArtifactAppResult> {
    const syncOptions: ArtifactAppSyncOptions = {
      syncLockLeaseMs: options.syncLockLeaseMs ?? DEFAULT_ARTIFACT_APPS_CONFIG.syncLockLeaseMs,
      syncLockRetryDelayMs:
        options.syncLockRetryDelayMs ?? DEFAULT_ARTIFACT_APPS_CONFIG.syncLockRetryDelayMs,
      syncLockRetryAttempts:
        options.syncLockRetryAttempts ?? DEFAULT_ARTIFACT_APPS_CONFIG.syncLockRetryAttempts,
      syncWriteRetryAttempts:
        options.syncWriteRetryAttempts ?? DEFAULT_ARTIFACT_APPS_CONFIG.syncWriteRetryAttempts,
    };
    const source = input.sourceMetadata;
    if (!source?.conversationId || !source.sourceKey) {
      throw new Error('[syncArtifactAppWithVersion] Stable source metadata is required');
    }

    const canonicalSourceKey = source.sourceKey;
    const canonicalSource = { ...source, sourceKey: canonicalSourceKey };
    const sourceQuery: ArtifactAppSourceQuery = {
      tenantId: input.tenantId,
      createdBy: input.createdBy,
      conversationId: source.conversationId,
      sourceKey: canonicalSourceKey,
    };
    let filter = buildSourceFilter(sourceQuery);
    let existing = await getApp()
      .findOne(filter)
      .select({ _id: 1, deletion: 1 })
      .lean<ArtifactAppIdentityRecord>()
      .exec();
    if (existing?.deletion) {
      throw new ArtifactAppDeletedError();
    }

    // A versioned key makes legacy interpretation explicit. Collect every
    // matching pre-version record so MIME-changing identifiers converge on a
    // deterministic survivor instead of leaving duplicate catalog entries.
    const legacySourceKey = getLegacySourceKey(canonicalSourceKey);
    if (legacySourceKey) {
      const legacyTypedPattern = legacyTypedSourceKeyPattern(legacySourceKey);
      const legacySourceFilter = legacyTypedPattern
        ? {
            $or: [
              { 'sourceMetadata.sourceKey': legacySourceKey },
              { 'sourceMetadata.sourceKey': legacyTypedPattern },
            ],
          }
        : { 'sourceMetadata.sourceKey': legacySourceKey };
      const legacyApps = await getApp()
        .find({
          ...buildSourceOwnerFilter(sourceQuery),
          ...legacySourceFilter,
        })
        .select({
          _id: 1,
          status: 1,
          deletion: 1,
          updatedAt: 1,
          'sourceMetadata.sourceKey': 1,
        })
        .sort({ updatedAt: -1, _id: -1 })
        .lean<ArtifactAppIdentityRecord[]>()
        .exec();

      if (!existing && legacyApps.some((app) => app.deletion != null)) {
        throw new ArtifactAppDeletedError();
      }

      const activeLegacyApps = legacyApps.filter(
        (app) => app.deletion == null && app.status !== 'archived',
      );
      let survivor = existing ?? activeLegacyApps[0];
      if (!existing && survivor) {
        try {
          const migrated = await getApp()
            .findOneAndUpdate(
              {
                _id: survivor._id,
                deletion: { $exists: false },
                'sourceMetadata.sourceKey': survivor.sourceMetadata?.sourceKey,
              },
              { $set: { 'sourceMetadata.sourceKey': canonicalSourceKey } },
              { new: true },
            )
            .select({ _id: 1, deletion: 1 })
            .lean<ArtifactAppIdentityRecord>()
            .exec();
          existing =
            migrated ??
            (await getApp()
              .findOne(filter)
              .select({ _id: 1 })
              .lean<ArtifactAppIdentityRecord>()
              .exec());
        } catch (error) {
          if (!isRetryableWriteError(error)) {
            throw error;
          }
          existing = await getApp()
            .findOne(filter)
            .select({ _id: 1 })
            .lean<ArtifactAppIdentityRecord>()
            .exec();
        }
        survivor = existing ?? survivor;
      }

      if (survivor) {
        const duplicateIds = activeLegacyApps
          .filter((candidate) => candidate._id.toString() !== survivor._id.toString())
          .map((candidate) => candidate._id);
        if (duplicateIds.length > 0) {
          await getApp()
            .updateMany(
              { _id: { $in: duplicateIds }, deletion: { $exists: false } },
              {
                $set: {
                  status: 'archived',
                  archivedAt: new Date(),
                  'marketplace.listed': false,
                },
                $unset: { syncLock: 1 },
              },
            )
            .exec();
        }
        existing = survivor;
        filter = { _id: survivor._id };
      }
    }

    // Upgrade path for records created by the original manual Publish dialog,
    // which stored an originalArtifactId but had no stable sourceKey.
    if (!existing && source.originalArtifactId) {
      const legacyFilter: FilterQuery<IArtifactApp> = {
        createdBy: input.createdBy,
        'sourceMetadata.conversationId': source.conversationId,
        'sourceMetadata.originalArtifactId': source.originalArtifactId,
        'sourceMetadata.sourceKey': { $exists: false },
        ...(input.tenantId != null
          ? { tenantId: input.tenantId }
          : { tenantId: { $exists: false } }),
      };
      existing = await getApp()
        .findOne(legacyFilter)
        .select({ _id: 1 })
        .lean<ArtifactAppIdentityRecord>()
        .exec();
      if (existing) {
        filter = { _id: existing._id };
      }
    }

    if (!existing) {
      try {
        const { app, version } = await createArtifactAppWithVersion({
          ...input,
          sourceMetadata: canonicalSource,
          visibility: 'private',
          marketplace: { ...input.marketplace, listed: true },
        });
        return { app, version, created: true, versionCreated: true };
      } catch (error) {
        // A concurrent first sync may win the unique source index. Re-enter the
        // update path so both requests resolve to the same catalog record.
        if (!isRetryableWriteError(error)) {
          throw error;
        }
      }
    }

    const ArtifactApp = getApp();
    const ArtifactVersion = getVersion();
    const sourceHash = computeSourceHash(
      input.version.artifactType,
      input.version.sourceSnapshot,
      input.version.runtimeConfig,
    );

    const applyStandaloneSync = async (): Promise<SyncArtifactAppResult> => {
      const lockToken = `sync_${nanoid()}`;
      let app: IArtifactApp | null = null;
      let versionStaged = false;

      for (let attempt = 0; attempt < syncOptions.syncLockRetryAttempts; attempt++) {
        const now = new Date();
        app = await ArtifactApp.findOneAndUpdate(
          {
            ...filter,
            deletion: { $exists: false },
            $or: [{ syncLock: { $exists: false } }, { 'syncLock.expiresAt': { $lte: now } }],
          },
          {
            $set: {
              syncLock: {
                token: lockToken,
                expiresAt: new Date(now.getTime() + syncOptions.syncLockLeaseMs),
              },
            },
          },
          { new: true },
        ).exec();
        if (app) {
          break;
        }
        const blockedApp = await ArtifactApp.findOne(filter).select({ deletion: 1 }).lean().exec();
        if (blockedApp?.deletion) {
          throw new ArtifactAppDeletedError();
        }
        if (!blockedApp) {
          throw new Error(
            '[syncArtifactAppWithVersion] Artifact app not found after source lookup',
          );
        }
        await waitForSyncLock(syncOptions.syncLockRetryDelayMs);
      }

      if (!app) {
        throw new Error('[syncArtifactAppWithVersion] Timed out waiting for artifact sync lock');
      }

      try {
        let recoveredVersion = false;
        const recoverableVersion = await ArtifactVersion.findOne({
          artifactAppId: app.artifactAppId,
          versionNumber: app.latestVersionNumber + 1,
        }).exec();
        if (recoverableVersion) {
          const recoveredApp = await ArtifactApp.findOneAndUpdate(
            {
              _id: app._id,
              'syncLock.token': lockToken,
              latestVersionNumber: app.latestVersionNumber,
              deletion: { $exists: false },
            },
            {
              $set: {
                latestVersionNumber: recoverableVersion.versionNumber,
                activeVersionId: recoverableVersion.artifactVersionId,
              },
            },
            { new: true },
          ).exec();
          if (!recoveredApp) {
            if (await ArtifactApp.exists({ _id: app._id, deletion: { $exists: true } })) {
              throw new ArtifactAppDeletedError();
            }
            throw new Error('[syncArtifactAppWithVersion] Artifact sync lock was lost');
          }
          app = recoveredApp;
          recoveredVersion = true;
        }

        const versionQuery = app.activeVersionId
          ? ArtifactVersion.findOne({
              artifactAppId: app.artifactAppId,
              artifactVersionId: app.activeVersionId,
            })
          : ArtifactVersion.findOne({ artifactAppId: app.artifactAppId }).sort({
              versionNumber: -1,
            });
        const activeVersion = await versionQuery.exec();
        const metadata = canonicalSource;

        if (activeVersion?.integrity.sourceHash === sourceHash) {
          const updatedApp = await ArtifactApp.findOneAndUpdate(
            {
              _id: app._id,
              'syncLock.token': lockToken,
              deletion: { $exists: false },
            },
            {
              $set: {
                title: input.title,
                sourceMetadata: metadata,
                'marketplace.listed': true,
              },
              $unset: { syncLock: 1 },
            },
            { new: true },
          ).exec();
          if (!updatedApp) {
            if (await ArtifactApp.exists({ _id: app._id, deletion: { $exists: true } })) {
              throw new ArtifactAppDeletedError();
            }
            throw new Error('[syncArtifactAppWithVersion] Artifact sync lock was lost');
          }
          return {
            app: toAppRecord(updatedApp),
            version: toVersionRecord(activeVersion),
            created: false,
            versionCreated: recoveredVersion,
          };
        }

        const nextVersionNumber = app.latestVersionNumber + 1;
        const versionSeed = buildVersionDoc(
          app.artifactAppId,
          app.tenantId,
          nextVersionNumber,
          input.version,
          'draft',
        );
        const stagedVersionId = versionSeed.artifactVersionId;
        if (!stagedVersionId) {
          throw new Error('[syncArtifactAppWithVersion] Version seed has no identifier');
        }
        const [version] = await ArtifactVersion.create([versionSeed]);
        versionStaged = true;
        const updatedApp = await ArtifactApp.findOneAndUpdate(
          {
            _id: app._id,
            'syncLock.token': lockToken,
            latestVersionNumber: app.latestVersionNumber,
            deletion: { $exists: false },
          },
          {
            $set: {
              title: input.title,
              sourceMetadata: metadata,
              'marketplace.listed': true,
              latestVersionNumber: nextVersionNumber,
              activeVersionId: version.artifactVersionId,
            },
            $unset: { syncLock: 1 },
          },
          { new: true },
        ).exec();
        if (!updatedApp) {
          if (await ArtifactApp.exists({ _id: app._id, deletion: { $exists: true } })) {
            await ArtifactVersion.deleteOne({ artifactVersionId: stagedVersionId }).exec();
            versionStaged = false;
            throw new ArtifactAppDeletedError();
          }
          throw new Error('[syncArtifactAppWithVersion] Artifact sync lock was lost');
        }
        return {
          app: toAppRecord(updatedApp),
          version: toVersionRecord(version),
          created: false,
          versionCreated: true,
        };
      } catch (error) {
        await ArtifactApp.updateOne(
          { _id: app._id, 'syncLock.token': lockToken },
          { $unset: { syncLock: 1 } },
        ).exec();
        if (versionStaged) {
          throw new ArtifactSyncRetryError(
            '[syncArtifactAppWithVersion] Recovering staged artifact version',
          );
        }
        throw error;
      }
    };

    const applySync = async (session?: ClientSession): Promise<SyncArtifactAppResult> => {
      const appQuery = ArtifactApp.findOne(filter);
      if (session) appQuery.session(session);
      const app = await appQuery.exec();
      if (!app) {
        throw new Error('[syncArtifactAppWithVersion] Artifact app not found after source lookup');
      }
      if (app.deletion) {
        throw new ArtifactAppDeletedError();
      }

      const versionQuery = app.activeVersionId
        ? ArtifactVersion.findOne({
            artifactAppId: app.artifactAppId,
            artifactVersionId: app.activeVersionId,
          })
        : ArtifactVersion.findOne({ artifactAppId: app.artifactAppId }).sort({ versionNumber: -1 });
      if (session) versionQuery.session(session);
      const activeVersion = await versionQuery.exec();

      app.title = input.title;
      app.sourceMetadata = {
        ...canonicalSource,
      };
      app.set('marketplace.listed', true);

      if (activeVersion?.integrity.sourceHash === sourceHash) {
        await app.save(session ? { session } : undefined);
        return {
          app: toAppRecord(app),
          version: toVersionRecord(activeVersion),
          created: false,
          versionCreated: false,
        };
      }

      const nextNumber = app.latestVersionNumber + 1;
      const versionSeed = buildVersionDoc(
        app.artifactAppId,
        app.tenantId,
        nextNumber,
        input.version,
        'draft',
      );
      const createOptions = session ? { session } : undefined;
      const [version] = await ArtifactVersion.create([versionSeed], createOptions);
      app.latestVersionNumber = nextNumber;
      app.activeVersionId = version.artifactVersionId;
      await app.save(session ? { session } : undefined);
      return {
        app: toAppRecord(app),
        version: toVersionRecord(version),
        created: false,
        versionCreated: true,
      };
    };

    if (!(await supportsTransactions(mongoose))) {
      for (let attempt = 0; attempt < syncOptions.syncWriteRetryAttempts; attempt++) {
        try {
          return await applyStandaloneSync();
        } catch (error) {
          if (!isRetryableWriteError(error) || attempt === syncOptions.syncWriteRetryAttempts - 1) {
            throw error;
          }
        }
      }
      throw new Error('[syncArtifactAppWithVersion] Standalone sync exhausted retries');
    }

    const session = await mongoose.startSession();
    try {
      let result: SyncArtifactAppResult | undefined;
      await session.withTransaction(async () => {
        result = await applySync(session);
      });
      if (!result) {
        throw new Error('[syncArtifactAppWithVersion] Transaction produced no result');
      }
      return result;
    } finally {
      await session.endSession();
    }
  }

  async function resolveArtifactAppId(query: ArtifactAppQuery): Promise<string | null> {
    const doc = await getApp()
      .findOne({
        artifactAppId: query.artifactAppId,
        deletion: { $exists: false },
        status: { $ne: 'archived' },
      })
      .select({ _id: 1, artifactAppId: 1 })
      .lean<{ _id: Types.ObjectId; artifactAppId: string }>()
      .exec();
    return doc?._id.toString() ?? null;
  }

  async function listArtifactApps(options: ArtifactAppListOptions): Promise<ArtifactAppListPage> {
    let ownershipFilter: FilterQuery<IArtifactApp> = {
      deletion: { $exists: false },
      status: { $ne: 'archived' },
    };
    if (options.createdBy) {
      ownershipFilter = {
        createdBy: options.createdBy,
        deletion: { $exists: false },
        status: { $ne: 'archived' },
      };
    } else if (options.excludeCreatedBy) {
      ownershipFilter = {
        createdBy: { $ne: options.excludeCreatedBy },
        deletion: { $exists: false },
        status: { $ne: 'archived' },
      };
    }
    const cursor = options.cursor ? decodeAppCursor(options.cursor) : null;
    const cursorFilter: FilterQuery<IArtifactApp> | undefined = cursor
      ? {
          $or: [
            { updatedAt: { $lt: cursor.updatedAt } },
            { updatedAt: cursor.updatedAt, _id: { $lt: cursor.id } },
          ],
        }
      : undefined;
    const filters: FilterQuery<IArtifactApp>[] = [ownershipFilter];
    if (cursorFilter) {
      filters.push(cursorFilter);
    }
    const search = options.search?.trim();
    if (search) {
      const searchRegex = new RegExp(escapeRegExp(search), 'i');
      filters.push({
        $or: [
          { title: searchRegex },
          { description: searchRegex },
          { category: searchRegex },
          { tags: searchRegex },
        ],
      });
    }
    const apps = await getApp()
      .find(filters.length === 1 ? filters[0] : { $and: filters })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(options.limit + 1)
      .lean<IArtifactApp[]>()
      .exec();
    const hasMore = apps.length > options.limit;
    const page = hasMore ? apps.slice(0, options.limit) : apps;
    const entries = page.map((app) => ({ app: toAppRecord(app), cursor: encodeAppCursor(app) }));
    return {
      entries,
      hasMore,
      after: hasMore ? (entries[entries.length - 1]?.cursor ?? null) : null,
    };
  }

  async function updateArtifactApp(
    query: ArtifactAppQuery,
    update: ArtifactAppUpdate,
  ): Promise<ArtifactAppRecord | null> {
    const app = await getApp()
      .findOneAndUpdate(
        {
          artifactAppId: query.artifactAppId,
          deletion: { $exists: false },
          status: { $ne: 'archived' },
        },
        { $set: update },
        { new: true },
      )
      .lean<IArtifactApp>()
      .exec();
    return app ? toAppRecord(app) : null;
  }

  async function deleteArtifactApp(
    query: ArtifactAppQuery,
  ): Promise<{ deletedApp: boolean; deletedVersions: number }> {
    const performDelete = async (session?: ClientSession) => {
      const appQuery = getApp().findOne({ artifactAppId: query.artifactAppId });
      if (session) appQuery.session(session);
      const app = await appQuery.exec();
      if (!app) {
        return { deletedApp: false, deletedVersions: 0 };
      }
      const versionResult = await getVersion().deleteMany(
        { artifactAppId: query.artifactAppId },
        session ? { session } : undefined,
      );
      const appResult = await getApp().deleteOne(
        { _id: app._id },
        session ? { session } : undefined,
      );
      return {
        deletedApp: appResult.deletedCount === 1,
        deletedVersions: versionResult.deletedCount ?? 0,
      };
    };

    if (!(await supportsTransactions(mongoose))) {
      return performDelete();
    }
    const session = await mongoose.startSession();
    try {
      let result: { deletedApp: boolean; deletedVersions: number } | undefined;
      await session.withTransaction(async () => {
        result = await performDelete(session);
      });
      return result ?? { deletedApp: false, deletedVersions: 0 };
    } finally {
      await session.endSession();
    }
  }

  async function prepareArtifactAppDeletion(
    query: ArtifactAppQuery,
    requestedBy: string,
  ): Promise<ArtifactAppDeletionResult> {
    const prepare = async (session?: ClientSession): Promise<ArtifactAppDeletionResult> => {
      const appQuery = getApp().findOneAndUpdate(
        {
          artifactAppId: query.artifactAppId,
          $or: [{ deletion: { $exists: false } }, { 'deletion.requestedBy': requestedBy }],
        },
        { $set: { deletion: { requestedBy, requestedAt: new Date() } } },
        { new: true, ...(session ? { session } : {}) },
      );
      const app = await appQuery.exec();
      if (!app) {
        const existingQuery = getApp().exists({ artifactAppId: query.artifactAppId });
        if (session) existingQuery.session(session);
        if (await existingQuery) {
          throw new Error('[prepareArtifactAppDeletion] Deletion is already in progress');
        }
        return { found: false, deletedVersions: 0 };
      }
      const versionResult = await getVersion().deleteMany(
        { artifactAppId: query.artifactAppId },
        session ? { session } : undefined,
      );
      return {
        found: true,
        resourceId: app._id.toString(),
        deletedVersions: versionResult.deletedCount ?? 0,
      };
    };

    if (!(await supportsTransactions(mongoose))) {
      return prepare();
    }
    const session = await mongoose.startSession();
    try {
      let result: ArtifactAppDeletionResult | undefined;
      await session.withTransaction(async () => {
        result = await prepare(session);
      });
      return result ?? { found: false, deletedVersions: 0 };
    } finally {
      await session.endSession();
    }
  }

  async function finalizeArtifactAppDeletion(
    query: ArtifactAppQuery,
    requestedBy: string,
  ): Promise<boolean> {
    const result = await getApp()
      .updateOne(
        {
          artifactAppId: query.artifactAppId,
          'deletion.requestedBy': requestedBy,
        },
        {
          $set: {
            'deletion.finalizedAt': new Date(),
            status: 'archived',
            archivedAt: new Date(),
            'marketplace.listed': false,
          },
          $unset: { activeVersionId: 1, syncLock: 1 },
        },
      )
      .exec();
    return result.matchedCount === 1;
  }

  async function getArtifactVersion(
    query: ArtifactVersionQuery,
  ): Promise<ArtifactVersionRecord | null> {
    const version = await getVersion()
      .findOne(buildVersionFilter(query))
      .lean<IArtifactVersion>()
      .exec();
    return version ? toVersionRecord(version) : null;
  }

  async function listArtifactVersions(
    options: ArtifactVersionListOptions,
  ): Promise<ArtifactVersionListPage> {
    const beforeVersion = options.cursor ? decodeVersionCursor(options.cursor) : null;
    const filter: FilterQuery<IArtifactVersion> = {
      artifactAppId: options.artifactAppId,
      ...(beforeVersion != null ? { versionNumber: { $lt: beforeVersion } } : {}),
    };
    const versions = await getVersion()
      .find(filter)
      .select({ sourceSnapshot: 0, runtimeConfig: 0, integrity: 0 })
      .sort({ versionNumber: -1 })
      .limit(options.limit + 1)
      .lean<IArtifactVersion[]>()
      .exec();
    const hasMore = versions.length > options.limit;
    const page = hasMore ? versions.slice(0, options.limit) : versions;
    const lastVersion = page[page.length - 1];
    return {
      versions: page.map(toVersionSummary),
      hasMore,
      after: hasMore && lastVersion ? encodeVersionCursor(lastVersion.versionNumber) : null,
    };
  }

  async function releaseArtifactVersion(
    query: ArtifactVersionQuery,
    releasedBy: string,
  ): Promise<ArtifactVersionRecord | null> {
    const version = await getVersion().findOne(buildVersionFilter(query)).exec();
    if (!version) {
      return null;
    }
    if (version.publication.state === 'released') {
      return toVersionRecord(version);
    }
    version.publication = {
      state: 'released',
      releasedBy,
      releasedAt: new Date(),
    };
    await version.save();
    return toVersionRecord(version);
  }

  async function activateArtifactVersion(
    query: ArtifactVersionQuery,
  ): Promise<ArtifactAppWithVersion | null> {
    const version = await getVersion().findOne(buildVersionFilter(query)).exec();
    if (!version) {
      return null;
    }
    if (version.publication.state !== 'released') {
      throw new Error('[activateArtifactVersion] Only released versions can be activated');
    }
    const app = await getApp().findOne({ artifactAppId: query.artifactAppId }).exec();
    if (!app) {
      return null;
    }
    app.activeVersionId = version.artifactVersionId;
    await app.save();
    return { app: toAppRecord(app), version: toVersionRecord(version) };
  }

  async function withdrawArtifactVersion(
    query: ArtifactVersionQuery,
  ): Promise<ArtifactVersionRecord | null> {
    const version = await getVersion().findOne(buildVersionFilter(query)).exec();
    if (!version) {
      return null;
    }
    version.publication = { ...version.publication, state: 'withdrawn' };
    await version.save();
    return toVersionRecord(version);
  }

  return {
    createArtifactAppWithVersion,
    syncArtifactAppWithVersion,
    getArtifactAppByAppId,
    getArtifactAppBySource,
    resolveArtifactAppId,
    listArtifactApps,
    updateArtifactApp,
    deleteArtifactApp,
    prepareArtifactAppDeletion,
    finalizeArtifactAppDeletion,
    getArtifactVersion,
    listArtifactVersions,
    releaseArtifactVersion,
    activateArtifactVersion,
    withdrawArtifactVersion,
  };
}
