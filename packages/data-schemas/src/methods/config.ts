import { Types } from 'mongoose';
import { PrincipalType, PrincipalModel } from 'librechat-data-provider';
import type { FilterQuery, UpdateQuery, Model, ClientSession } from 'mongoose';
import type { TCustomConfig } from 'librechat-data-provider';
import type { IConfig, ConfigTombstones, ConfigWritePrecondition } from '~/types';
import { BASE_CONFIG_PRINCIPAL_ID } from '~/admin/capabilities';
import { escapeRegExp } from '~/utils/string';

/** Tombstones a field write clears: the written path and its ancestors below the section. */
export function getTombstonePathsToClear(fieldPath: string): string[] {
  const parts = fieldPath.split('.');
  if (parts.length <= 1) {
    return [fieldPath];
  }
  return parts.slice(1).map((_, index) => parts.slice(0, index + 2).join('.'));
}

function getPathAndDescendantsRegex(fieldPath: string): RegExp {
  return new RegExp(`^${escapeRegExp(fieldPath)}(?:\\.|$)`);
}

function isDuplicateKeyError(error: unknown): boolean {
  return (error as { code?: number } | null)?.code === 11000;
}

export function createConfigMethods(mongoose: typeof import('mongoose')): {
  listAllConfigs: (filter?: { isActive?: boolean }, session?: ClientSession) => Promise<IConfig[]>;
  listConfigTombstones: (fieldPath: string, session?: ClientSession) => Promise<ConfigTombstones[]>;
  findConfigByPrincipal: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    options?: { includeInactive?: boolean },
    session?: ClientSession,
  ) => Promise<IConfig | null>;
  getApplicableConfigs: (
    principals?: Array<{ principalType: string; principalId?: string | Types.ObjectId }>,
    session?: ClientSession,
  ) => Promise<IConfig[]>;
  upsertConfig: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    principalModel: PrincipalModel,
    overrides: Partial<TCustomConfig>,
    priority: number,
    session?: ClientSession,
    options?: { expectEmpty?: boolean; preservePriority?: boolean } & ConfigWritePrecondition,
  ) => Promise<IConfig | null>;
  patchConfigFields: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    principalModel: PrincipalModel,
    fields: Record<string, unknown>,
    priority: number,
    session?: ClientSession,
    options?: ConfigWritePrecondition,
  ) => Promise<IConfig | null>;
  tombstoneConfigField: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    principalModel: PrincipalModel,
    fieldPath: string,
    priority: number,
    session?: ClientSession,
    options?: ConfigWritePrecondition,
  ) => Promise<IConfig | null>;
  unsetConfigField: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    fieldPath: string,
    session?: ClientSession,
    options?: ConfigWritePrecondition,
  ) => Promise<IConfig | null>;
  deleteConfig: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    session?: ClientSession,
    options?: { expectEmpty?: boolean },
  ) => Promise<IConfig | null>;
  restoreConfig: (snapshot: Record<string, unknown>) => Promise<boolean>;
  toggleConfigActive: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    isActive: boolean,
    session?: ClientSession,
    options?: { expectEmpty?: boolean },
  ) => Promise<IConfig | null>;
  /** Like `toggleConfigActive`, but also reports whether this write changed `isActive`. */
  toggleConfigActiveTracked: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    isActive: boolean,
    options?: { expectEmpty?: boolean },
  ) => Promise<{ config: IConfig; changed: boolean } | null>;
} {
  async function findConfigByPrincipal(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    options?: { includeInactive?: boolean },
    session?: ClientSession,
  ): Promise<IConfig | null> {
    const Config = mongoose.models.Config as Model<IConfig>;
    const filter: { principalType: PrincipalType; principalId: string; isActive?: boolean } = {
      principalType,
      principalId: principalId.toString(),
    };
    if (!options?.includeInactive) {
      filter.isActive = true;
    }
    return await Config.findOne(filter)
      .session(session ?? null)
      .lean<IConfig>();
  }

  async function listAllConfigs(
    filter?: { isActive?: boolean },
    session?: ClientSession,
  ): Promise<IConfig[]> {
    const Config = mongoose.models.Config as Model<IConfig>;
    const where: { isActive?: boolean } = {};
    if (filter?.isActive !== undefined) {
      where.isActive = filter.isActive;
    }
    return await Config.find(where)
      .sort({ priority: 1 })
      .session(session ?? null)
      .lean<IConfig[]>();
  }

  /**
   * Active profiles with a tombstone at `fieldPath` or below it, across every tenant the caller's
   * scope can read. Projects only what names the principal and the tombstones, so a scan never
   * loads the profiles' overrides.
   */
  async function listConfigTombstones(
    fieldPath: string,
    session?: ClientSession,
  ): Promise<ConfigTombstones[]> {
    const Config = mongoose.models.Config as Model<IConfig>;
    return await Config.find(
      { isActive: true, tombstones: { $regex: getPathAndDescendantsRegex(fieldPath) } },
      { _id: 0, principalType: 1, principalId: 1, tenantId: 1, tombstones: 1 },
    )
      .sort({ priority: 1, _id: 1 })
      .session(session ?? null)
      .lean<ConfigTombstones[]>();
  }

  async function getApplicableConfigs(
    principals?: Array<{ principalType: string; principalId?: string | Types.ObjectId }>,
    session?: ClientSession,
  ): Promise<IConfig[]> {
    const Config = mongoose.models.Config as Model<IConfig>;

    const basePrincipal = {
      principalType: PrincipalType.ROLE as string,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
    };

    const principalsQuery = [basePrincipal];

    if (principals && principals.length > 0) {
      for (const p of principals) {
        if (p.principalId !== undefined) {
          principalsQuery.push({
            principalType: p.principalType,
            principalId: p.principalId.toString(),
          });
        }
      }
    }

    return await Config.find({
      $or: principalsQuery,
      isActive: true,
    })
      .sort({ priority: 1 })
      .session(session ?? null)
      .lean<IConfig[]>();
  }

  /**
   * The filter a write with a version precondition applies to, or `null` when
   * the precondition no longer holds. A caller that saw no document gets an
   * empty one created first, at version 0, so its write cannot land on a
   * document another writer created after the read.
   */
  async function getPreconditionFilter(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    onInsert: { principalModel: PrincipalModel; priority: number },
    expectedVersion: number | null,
    session?: ClientSession,
  ): Promise<FilterQuery<IConfig> | null> {
    const filter = { principalType, principalId: principalId.toString() };
    if (expectedVersion != null) {
      return { ...filter, configVersion: expectedVersion };
    }
    const Config = mongoose.models.Config as Model<IConfig>;
    const now = new Date();
    try {
      /** Timestamps are written on insert only, so a document that already exists is left untouched. */
      const result = await Config.findOneAndUpdate(
        filter,
        { $setOnInsert: { ...onInsert, createdAt: now, updatedAt: now } },
        {
          upsert: true,
          new: true,
          timestamps: false,
          setDefaultsOnInsert: true,
          includeResultMetadata: true,
          ...(session ? { session } : {}),
        },
      );
      if (result.value == null || result.lastErrorObject?.updatedExisting === true) {
        return null;
      }
      return { ...filter, configVersion: result.value.configVersion };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return null;
      }
      throw error;
    }
  }

  /** Applies `update` only to the document version the caller read; `null` once it no longer matches. */
  async function updateAtVersion(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    onInsert: { principalModel: PrincipalModel; priority: number },
    expectedVersion: number | null,
    update: UpdateQuery<IConfig>,
    session?: ClientSession,
  ): Promise<IConfig | null> {
    const filter = await getPreconditionFilter(
      principalType,
      principalId,
      onInsert,
      expectedVersion,
      session,
    );
    if (filter == null) {
      return null;
    }
    const Config = mongoose.models.Config as Model<IConfig>;
    const sessionOption = session ? { session } : {};
    try {
      return await Config.findOneAndUpdate(filter, update, { new: true, ...sessionOption });
    } catch (error) {
      if (expectedVersion === null) {
        /**
         * Removes the empty document created above, so a write the database refused (such as a
         * key name the engine cannot store) stores nothing. The filter carries the created
         * version, so a document another write has since changed stays. A failure here
         * replaces the refusal: the caller must not report that nothing was stored.
         */
        await Config.deleteOne(filter, sessionOption);
      }
      throw error;
    }
  }

  async function upsertConfig(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    principalModel: PrincipalModel,
    overrides: Partial<TCustomConfig>,
    priority: number,
    session?: ClientSession,
    options?: { expectEmpty?: boolean; preservePriority?: boolean } & ConfigWritePrecondition,
  ): Promise<IConfig | null> {
    const Config = mongoose.models.Config as Model<IConfig>;
    const expectedVersion = options?.expectedVersion;

    const update = {
      $set: {
        principalModel,
        overrides,
        ...(options?.preservePriority ? {} : { priority }),
        isActive: true,
      },
      ...(options?.preservePriority ? { $setOnInsert: { priority } } : {}),
      $inc: { configVersion: 1 },
    };

    if (expectedVersion !== undefined) {
      return await updateAtVersion(
        principalType,
        principalId,
        { principalModel, priority },
        expectedVersion,
        update,
        session,
      );
    }

    const query: FilterQuery<IConfig> = {
      principalType,
      principalId: principalId.toString(),
    };
    if (options?.expectEmpty) {
      query.$and = [
        { $or: [{ overrides: { $eq: {} } }, { overrides: { $exists: false } }] },
        { $or: [{ tombstones: { $size: 0 } }, { tombstones: { $exists: false } }] },
      ];
    }

    const mongoOptions = {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      ...(session ? { session } : {}),
    };

    try {
      return await Config.findOneAndUpdate(query, update, mongoOptions);
    } catch (err: unknown) {
      if (isDuplicateKeyError(err)) {
        if (options?.expectEmpty) {
          return null;
        }
        return await Config.findOneAndUpdate(
          { principalType, principalId: principalId.toString() },
          { $set: update.$set, $inc: update.$inc },
          { new: true, ...(session ? { session } : {}) },
        );
      }
      throw err;
    }
  }

  async function patchConfigFields(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    principalModel: PrincipalModel,
    fields: Record<string, unknown>,
    priority: number,
    session?: ClientSession,
    options?: ConfigWritePrecondition,
  ): Promise<IConfig | null> {
    const Config = mongoose.models.Config as Model<IConfig>;
    const expectedVersion = options?.expectedVersion;

    const setPayload: { principalModel: PrincipalModel; priority: number; [key: string]: unknown } =
      {
        principalModel,
        priority,
      };

    for (const [path, value] of Object.entries(fields)) {
      setPayload[`overrides.${path}`] = value;
    }

    const tombstonesToClear = [...new Set(Object.keys(fields).flatMap(getTombstonePathsToClear))];

    const update: Record<string, unknown> = {
      $set: setPayload,
      $inc: { configVersion: 1 },
    };
    if (tombstonesToClear.length > 0) {
      update.$pull = { tombstones: { $in: tombstonesToClear } };
    }

    if (expectedVersion !== undefined) {
      return await updateAtVersion(
        principalType,
        principalId,
        { principalModel, priority },
        expectedVersion,
        update,
        session,
      );
    }

    return await Config.findOneAndUpdate(
      { principalType, principalId: principalId.toString() },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true, ...(session ? { session } : {}) },
    );
  }

  async function tombstoneConfigField(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    principalModel: PrincipalModel,
    fieldPath: string,
    priority: number,
    session?: ClientSession,
    options?: ConfigWritePrecondition,
  ): Promise<IConfig | null> {
    const Config = mongoose.models.Config as Model<IConfig>;
    const expectedVersion = options?.expectedVersion;

    const update = {
      $set: {
        principalModel,
        priority,
      },
      $unset: { [`overrides.${fieldPath}`]: '' },
      $addToSet: { tombstones: fieldPath },
      $inc: { configVersion: 1 },
    };

    if (expectedVersion !== undefined) {
      return await updateAtVersion(
        principalType,
        principalId,
        { principalModel, priority },
        expectedVersion,
        update,
        session,
      );
    }

    return await Config.findOneAndUpdate(
      { principalType, principalId: principalId.toString() },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true, ...(session ? { session } : {}) },
    );
  }

  async function unsetConfigField(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    fieldPath: string,
    session?: ClientSession,
    options?: ConfigWritePrecondition,
  ): Promise<IConfig | null> {
    const Config = mongoose.models.Config as Model<IConfig>;
    const expectedVersion = options?.expectedVersion;
    if (expectedVersion === null) {
      return null;
    }

    return await Config.findOneAndUpdate(
      {
        principalType,
        principalId: principalId.toString(),
        ...(expectedVersion !== undefined ? { configVersion: expectedVersion } : {}),
      },
      {
        $unset: { [`overrides.${fieldPath}`]: '' },
        $pull: { tombstones: { $regex: getPathAndDescendantsRegex(fieldPath) } },
        $inc: { configVersion: 1 },
      },
      { new: true, ...(session ? { session } : {}) },
    );
  }

  async function deleteConfig(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    session?: ClientSession,
    options?: { expectEmpty?: boolean },
  ): Promise<IConfig | null> {
    const Config = mongoose.models.Config as Model<IConfig>;
    const filter: FilterQuery<IConfig> = {
      principalType,
      principalId: principalId.toString(),
    };
    if (options?.expectEmpty) {
      filter.$and = [
        { $or: [{ overrides: { $eq: {} } }, { overrides: { $exists: false } }] },
        { $or: [{ tombstones: { $size: 0 } }, { tombstones: { $exists: false } }] },
      ];
    }
    return await Config.findOneAndDelete(filter).session(session ?? null);
  }

  function toggleFilter(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    options?: { expectEmpty?: boolean },
    extra: FilterQuery<IConfig> = {},
  ): FilterQuery<IConfig> {
    const filter: FilterQuery<IConfig> = {
      principalType,
      principalId: principalId.toString(),
      ...extra,
    };
    if (options?.expectEmpty) {
      filter.$and = [
        { $or: [{ overrides: { $eq: {} } }, { overrides: { $exists: false } }] },
        { $or: [{ tombstones: { $size: 0 } }, { tombstones: { $exists: false } }] },
      ];
    }
    return filter;
  }

  async function toggleConfigActive(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    isActive: boolean,
    session?: ClientSession,
    options?: { expectEmpty?: boolean },
  ): Promise<IConfig | null> {
    const Config = mongoose.models.Config as Model<IConfig>;
    return await Config.findOneAndUpdate(
      toggleFilter(principalType, principalId, options),
      { $set: { isActive } },
      { new: true, ...(session ? { session } : {}) },
    );
  }

  async function toggleConfigActiveTracked(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    isActive: boolean,
    options?: { expectEmpty?: boolean },
  ): Promise<{ config: IConfig; changed: boolean } | null> {
    const Config = mongoose.models.Config as Model<IConfig>;
    /** The filter matches only a document that differs, so a match is exactly one real change. */
    const changed = await Config.findOneAndUpdate(
      toggleFilter(principalType, principalId, options, { isActive: { $ne: isActive } }),
      { $set: { isActive } },
      { new: true },
    );
    if (changed) {
      return { config: changed, changed: true };
    }
    const current = await Config.findOne(toggleFilter(principalType, principalId, options));
    return current ? { config: current, changed: false } : null;
  }

  /**
   * Re-creates a deleted config document exactly as it was (tombstones, active flag,
   * version), only when no document exists for the principal. Returns whether it
   * inserted, so a document written after the snapshot is never overwritten.
   */
  async function restoreConfig(snapshot: Record<string, unknown>): Promise<boolean> {
    const Config = mongoose.models.Config as Model<IConfig>;
    const { principalType, principalId } = snapshot;
    const result = await Config.updateOne(
      { principalType, principalId },
      { $setOnInsert: snapshot },
      { upsert: true, timestamps: false },
    );
    return result.upsertedCount > 0;
  }

  return {
    listAllConfigs,
    listConfigTombstones,
    findConfigByPrincipal,
    getApplicableConfigs,
    upsertConfig,
    patchConfigFields,
    tombstoneConfigField,
    unsetConfigField,
    deleteConfig,
    restoreConfig,
    toggleConfigActive,
    toggleConfigActiveTracked,
  };
}

export type ConfigMethods = ReturnType<typeof createConfigMethods>;
