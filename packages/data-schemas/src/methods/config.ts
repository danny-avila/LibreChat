import { Types } from 'mongoose';
import { PrincipalType, PrincipalModel } from 'librechat-data-provider';
import { BASE_CONFIG_PRINCIPAL_ID } from '~/admin/capabilities';
import type { TCustomConfig } from 'librechat-data-provider';
import type { Model, ClientSession } from 'mongoose';
import type { IConfig } from '~/types';

export function createConfigMethods(mongoose: typeof import('mongoose')) {
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
      .lean();
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
      .lean();
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
      .lean();
  }

  async function upsertConfig(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    principalModel: PrincipalModel,
    overrides: Partial<TCustomConfig>,
    priority: number,
    session?: ClientSession,
  ): Promise<IConfig | null> {
    const Config = mongoose.models.Config as Model<IConfig>;

    const query = {
      principalType,
      principalId: principalId.toString(),
    };

    const update = {
      $set: {
        principalModel,
        overrides,
        priority,
        isActive: true,
      },
      $inc: { configVersion: 1 },
    };

    const options = {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      ...(session ? { session } : {}),
    };

    try {
      return await Config.findOneAndUpdate(query, update, options);
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 11000) {
        return await Config.findOneAndUpdate(
          query,
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
  ): Promise<IConfig | null> {
    const Config = mongoose.models.Config as Model<IConfig>;

    const setPayload: { principalModel: PrincipalModel; priority: number; [key: string]: unknown } =
      {
        principalModel,
        priority,
      };

    for (const [path, value] of Object.entries(fields)) {
      setPayload[`overrides.${path}`] = value;
    }

    const options = {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      ...(session ? { session } : {}),
    };

    return await Config.findOneAndUpdate(
      { principalType, principalId: principalId.toString() },
      { $set: setPayload, $inc: { configVersion: 1 } },
      options,
    );
  }

  async function unsetConfigField(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    fieldPath: string,
    session?: ClientSession,
  ): Promise<IConfig | null> {
    const Config = mongoose.models.Config as Model<IConfig>;

    const options = {
      new: true,
      ...(session ? { session } : {}),
    };

    return await Config.findOneAndUpdate(
      { principalType, principalId: principalId.toString() },
      { $unset: { [`overrides.${fieldPath}`]: '' }, $inc: { configVersion: 1 } },
      options,
    );
  }

  async function deleteConfig(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IConfig | null> {
    const Config = mongoose.models.Config as Model<IConfig>;

    return await Config.findOneAndDelete({
      principalType,
      principalId: principalId.toString(),
    }).session(session ?? null);
  }

  async function toggleConfigActive(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    isActive: boolean,
    session?: ClientSession,
  ): Promise<IConfig | null> {
    const Config = mongoose.models.Config as Model<IConfig>;
    return await Config.findOneAndUpdate(
      { principalType, principalId: principalId.toString() },
      { $set: { isActive } },
      { new: true, ...(session ? { session } : {}) },
    );
  }

  return {
    listAllConfigs,
    findConfigByPrincipal,
    getApplicableConfigs,
    upsertConfig,
    patchConfigFields,
    unsetConfigField,
    deleteConfig,
    toggleConfigActive,
  };
}

export type ConfigMethods = ReturnType<typeof createConfigMethods>;
