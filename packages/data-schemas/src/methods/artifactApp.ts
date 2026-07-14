import crypto from 'node:crypto';
import { nanoid } from 'nanoid';
import type { ClientSession, Model } from 'mongoose';
import type {
  IArtifactApp,
  IArtifactVersion,
  ArtifactAppQuery,
  ArtifactVersionQuery,
  CreateArtifactAppInput,
  CreateArtifactVersionInput,
  ArtifactAppWithVersion,
  ArtifactAppIdResolution,
  IArtifactVersionRuntimeConfig,
} from '~/types';
import { supportsTransactions } from '~/utils/transactions';

/** Snapshot schema version — bump when the canonical snapshot shape changes. */
export const ARTIFACT_SCHEMA_VERSION = 1;

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
  getArtifactAppByAppId: (query: ArtifactAppQuery) => Promise<IArtifactApp | null>;
  resolveArtifactAppId: (query: ArtifactAppQuery) => Promise<ArtifactAppIdResolution | null>;
  listArtifactApps: (filter: Partial<IArtifactApp>) => Promise<IArtifactApp[]>;
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
  activateArtifactVersion: (
    query: ArtifactVersionQuery,
  ) => Promise<ArtifactAppWithVersion | null>;
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

export function createArtifactAppMethods(
  mongoose: typeof import('mongoose'),
): ArtifactAppMethods {
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
        ...(state === 'released'
          ? { releasedBy: input.createdBy, releasedAt: new Date() }
          : {}),
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

    const versionSeed = buildVersionDoc(
      artifactAppId,
      input.tenantId,
      1,
      input.version,
      'draft',
    );

    const useTransaction = await supportsTransactions(mongoose);

    if (!useTransaction) {
      const [app] = await ArtifactApp.create([appDoc]);
      const [version] = await ArtifactVersion.create([versionSeed]);
      app.activeVersionId = version.artifactVersionId;
      await app.save();
      return { app, version };
    }

    const session: ClientSession = await mongoose.startSession();
    try {
      let result: ArtifactAppWithVersion | undefined;
      await session.withTransaction(async () => {
        const [app] = await ArtifactApp.create([appDoc], { session });
        const [version] = await ArtifactVersion.create([versionSeed], { session });
        app.activeVersionId = version.artifactVersionId;
        await app.save({ session });
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

  async function listArtifactApps(filter: Partial<IArtifactApp>): Promise<IArtifactApp[]> {
    return getApp().find(filter).sort({ updatedAt: -1 }).lean<IArtifactApp[]>().exec();
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

  async function getArtifactVersion(
    query: ArtifactVersionQuery,
  ): Promise<IArtifactVersion | null> {
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
    getArtifactAppByAppId,
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
