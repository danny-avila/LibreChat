import { nanoid } from 'nanoid';
import crypto from 'node:crypto';
import type { ClientSession, FilterQuery, Model } from 'mongoose';
import type {
  IArtifactApp,
  IArtifactVersion,
  ArtifactAppQuery,
  ArtifactVersionQuery,
  CreateArtifactAppInput,
  CreateArtifactVersionInput,
  ArtifactAppWithVersion,
  ArtifactAppIdResolution,
  ArtifactAppSourceQuery,
  SyncArtifactAppResult,
  IArtifactVersionRuntimeConfig,
  ArtifactAppListOptions,
} from '~/types';
import { supportsTransactions } from '~/utils/transactions';

/** Snapshot schema version — bump when the canonical snapshot shape changes. */
export const ARTIFACT_SCHEMA_VERSION = 1;
const SYNC_LOCK_LEASE_MS = 5000;
const SYNC_LOCK_RETRY_DELAY_MS = 50;
const SYNC_LOCK_RETRY_ATTEMPTS = 100;
const SYNC_WRITE_RETRY_ATTEMPTS = 3;

interface MongoWriteError {
  code?: number;
  errorLabels?: string[];
}

class ArtifactSyncRetryError extends Error {}

function isRetryableWriteError(error: unknown): boolean {
  const writeError = error as MongoWriteError;
  return (
    error instanceof ArtifactSyncRetryError ||
    writeError.code === 11000 ||
    writeError.code === 112 ||
    writeError.errorLabels?.includes('TransientTransactionError') === true
  );
}

function waitForSyncLock(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, SYNC_LOCK_RETRY_DELAY_MS));
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
        return { app, version };
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
        result = { app, version };
      });
      if (!result) {
        throw new Error('[createArtifactAppWithVersion] Transaction produced no result');
      }
      return result;
    } finally {
      await session.endSession();
    }
  }

  async function getArtifactAppByAppId(query: ArtifactAppQuery): Promise<IArtifactApp | null> {
    return getApp().findOne({ artifactAppId: query.artifactAppId }).lean<IArtifactApp>().exec();
  }

  function buildSourceFilter(query: ArtifactAppSourceQuery): FilterQuery<IArtifactApp> {
    const filter: FilterQuery<IArtifactApp> = {
      createdBy: query.createdBy,
      'sourceMetadata.conversationId': query.conversationId,
      'sourceMetadata.sourceKey': query.sourceKey,
    };
    if (query.tenantId != null) {
      filter.tenantId = query.tenantId;
    } else {
      filter.tenantId = { $exists: false };
    }
    return filter;
  }

  async function getArtifactAppBySource(
    query: ArtifactAppSourceQuery,
  ): Promise<IArtifactApp | null> {
    return getApp().findOne(buildSourceFilter(query)).lean<IArtifactApp>().exec();
  }

  /**
   * Creates the catalog record once, then appends and activates a new snapshot
   * only when its canonical content hash changes. Version history remains in
   * the separate ArtifactVersion collection so it can grow independently.
   */
  async function syncArtifactAppWithVersion(
    input: CreateArtifactAppInput,
  ): Promise<SyncArtifactAppResult> {
    const source = input.sourceMetadata;
    if (!source?.conversationId || !source.sourceKey) {
      throw new Error('[syncArtifactAppWithVersion] Stable source metadata is required');
    }

    const sourceQuery: ArtifactAppSourceQuery = {
      tenantId: input.tenantId,
      createdBy: input.createdBy,
      conversationId: source.conversationId,
      sourceKey: source.sourceKey,
    };
    let filter = buildSourceFilter(sourceQuery);
    let existing = await getApp().findOne(filter).select({ _id: 1 }).lean().exec();

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
      existing = await getApp().findOne(legacyFilter).select({ _id: 1 }).lean().exec();
      if (existing) {
        filter = { _id: existing._id };
      }
    }

    if (!existing) {
      try {
        const { app, version } = await createArtifactAppWithVersion({
          ...input,
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

      for (let attempt = 0; attempt < SYNC_LOCK_RETRY_ATTEMPTS; attempt++) {
        const now = new Date();
        app = await ArtifactApp.findOneAndUpdate(
          {
            ...filter,
            $or: [{ syncLock: { $exists: false } }, { 'syncLock.expiresAt': { $lte: now } }],
          },
          {
            $set: {
              syncLock: {
                token: lockToken,
                expiresAt: new Date(now.getTime() + SYNC_LOCK_LEASE_MS),
              },
            },
          },
          { new: true },
        ).exec();
        if (app) {
          break;
        }
        if (!(await ArtifactApp.exists(filter))) {
          throw new Error(
            '[syncArtifactAppWithVersion] Artifact app not found after source lookup',
          );
        }
        await waitForSyncLock();
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
        const metadata = {
          ...source,
          conversationId: source.conversationId,
          sourceKey: source.sourceKey,
        };

        if (activeVersion?.integrity.sourceHash === sourceHash) {
          const updatedApp = await ArtifactApp.findOneAndUpdate(
            { _id: app._id, 'syncLock.token': lockToken },
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
            throw new Error('[syncArtifactAppWithVersion] Artifact sync lock was lost');
          }
          return {
            app: updatedApp,
            version: activeVersion,
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
          throw new Error('[syncArtifactAppWithVersion] Artifact sync lock was lost');
        }
        return {
          app: updatedApp,
          version,
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
        ...source,
        conversationId: source.conversationId,
        sourceKey: source.sourceKey,
      };
      app.set('marketplace.listed', true);

      if (activeVersion?.integrity.sourceHash === sourceHash) {
        await app.save(session ? { session } : undefined);
        return {
          app: app.toObject() as IArtifactApp,
          version: activeVersion.toObject() as IArtifactVersion,
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
        app: app.toObject() as IArtifactApp,
        version: version.toObject() as IArtifactVersion,
        created: false,
        versionCreated: true,
      };
    };

    if (!(await supportsTransactions(mongoose))) {
      for (let attempt = 0; attempt < SYNC_WRITE_RETRY_ATTEMPTS; attempt++) {
        try {
          return await applyStandaloneSync();
        } catch (error) {
          if (!isRetryableWriteError(error) || attempt === SYNC_WRITE_RETRY_ATTEMPTS - 1) {
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

  async function resolveArtifactAppId(
    query: ArtifactAppQuery,
  ): Promise<ArtifactAppIdResolution | null> {
    const doc = await getApp()
      .findOne({ artifactAppId: query.artifactAppId })
      .select({ _id: 1, artifactAppId: 1 })
      .lean<ArtifactAppIdResolution>()
      .exec();
    return doc;
  }

  async function listArtifactApps(
    filter: FilterQuery<IArtifactApp>,
    options: ArtifactAppListOptions = {},
  ): Promise<IArtifactApp[]> {
    const cursorFilter: FilterQuery<IArtifactApp> | undefined = options.cursor
      ? {
          $or: [
            { updatedAt: { $lt: options.cursor.updatedAt } },
            { updatedAt: options.cursor.updatedAt, _id: { $lt: options.cursor._id } },
          ],
        }
      : undefined;
    const query = getApp()
      .find(cursorFilter ? { $and: [filter, cursorFilter] } : filter)
      .sort({ updatedAt: -1, _id: -1 });
    if (options.limit) {
      query.limit(options.limit);
    }
    return query.lean<IArtifactApp[]>().exec();
  }

  async function updateArtifactApp(
    query: ArtifactAppQuery,
    update: Partial<IArtifactApp>,
  ): Promise<IArtifactApp | null> {
    return getApp()
      .findOneAndUpdate({ artifactAppId: query.artifactAppId }, { $set: update }, { new: true })
      .lean<IArtifactApp>()
      .exec();
  }

  async function deleteArtifactApp(
    query: ArtifactAppQuery,
  ): Promise<{ deletedApp: boolean; deletedVersions: number }> {
    const app = await getApp().findOneAndDelete({ artifactAppId: query.artifactAppId }).exec();
    if (!app) {
      return { deletedApp: false, deletedVersions: 0 };
    }
    const { deletedCount } = await getVersion()
      .deleteMany({ artifactAppId: query.artifactAppId })
      .exec();
    return { deletedApp: true, deletedVersions: deletedCount ?? 0 };
  }

  async function getArtifactVersion(query: ArtifactVersionQuery): Promise<IArtifactVersion | null> {
    return getVersion().findOne(buildVersionFilter(query)).lean<IArtifactVersion>().exec();
  }

  async function listArtifactVersions(query: ArtifactAppQuery): Promise<IArtifactVersion[]> {
    return getVersion()
      .find({ artifactAppId: query.artifactAppId })
      .sort({ versionNumber: -1 })
      .lean<IArtifactVersion[]>()
      .exec();
  }

  async function createArtifactVersion(
    query: ArtifactAppQuery,
    input: CreateArtifactVersionInput,
  ): Promise<IArtifactVersion> {
    const ArtifactApp = getApp();
    const app = await ArtifactApp.findOne({ artifactAppId: query.artifactAppId }).exec();
    if (!app) {
      throw new Error('[createArtifactVersion] Artifact app not found');
    }
    const nextNumber = app.latestVersionNumber + 1;
    const versionSeed = buildVersionDoc(
      app.artifactAppId,
      app.tenantId,
      nextNumber,
      input,
      'draft',
    );
    const [version] = await getVersion().create([versionSeed]);
    app.latestVersionNumber = nextNumber;
    await app.save();
    return version.toObject() as IArtifactVersion;
  }

  async function releaseArtifactVersion(
    query: ArtifactVersionQuery,
    releasedBy: string,
  ): Promise<IArtifactVersion | null> {
    const version = await getVersion().findOne(buildVersionFilter(query)).exec();
    if (!version) {
      return null;
    }
    if (version.publication.state === 'released') {
      return version.toObject() as IArtifactVersion;
    }
    version.publication = {
      state: 'released',
      releasedBy,
      releasedAt: new Date(),
    };
    await version.save();
    return version.toObject() as IArtifactVersion;
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
    return { app: app.toObject() as IArtifactApp, version: version.toObject() as IArtifactVersion };
  }

  async function withdrawArtifactVersion(
    query: ArtifactVersionQuery,
  ): Promise<IArtifactVersion | null> {
    const version = await getVersion().findOne(buildVersionFilter(query)).exec();
    if (!version) {
      return null;
    }
    version.publication = { ...version.publication, state: 'withdrawn' };
    await version.save();
    return version.toObject() as IArtifactVersion;
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
    getArtifactVersion,
    listArtifactVersions,
    createArtifactVersion,
    releaseArtifactVersion,
    activateArtifactVersion,
    withdrawArtifactVersion,
  };
}
