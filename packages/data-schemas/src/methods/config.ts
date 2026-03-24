import { Types } from 'mongoose';
import { PrincipalType, PrincipalModel } from 'librechat-data-provider';
import { BASE_CONFIG_PRINCIPAL_ID } from '~/admin/capabilities';
import type { Model, ClientSession } from 'mongoose';
import type { IConfig } from '~/types';

export function createConfigMethods(mongoose: typeof import('mongoose')) {
  async function findConfigByPrincipal(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IConfig | null> {
    const Config = mongoose.models.Config as Model<IConfig>;
    const query = Config.findOne({
      principalType,
      principalId: principalId.toString(),
      isActive: true,
    });
    if (session) {
      query.session(session);
    }
    return await query.lean();
  }

  async function listAllConfigs(session?: ClientSession): Promise<IConfig[]> {
    const Config = mongoose.models.Config as Model<IConfig>;
    const query = Config.find({ isActive: true }).sort({ priority: 1 });
    if (session) {
      query.session(session);
    }
    return await query.lean();
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

    const configQuery = Config.find({
      $or: principalsQuery,
      isActive: true,
    }).sort({ priority: 1 });

    if (session) {
      configQuery.session(session);
    }

    return await configQuery.lean();
  }

  async function upsertConfig(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    principalModel: PrincipalModel,
    overrides: Record<string, unknown>,
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

    return await Config.findOneAndUpdate(query, update, options);
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

    const setPayload: Record<string, unknown> = {
      principalModel,
      priority,
      isActive: true,
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
      { principalType, principalId: principalId.toString(), isActive: true },
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

    const query = Config.findOneAndDelete({
      principalType,
      principalId: principalId.toString(),
    });

    if (session) {
      query.session(session);
    }

    return await query;
  }

  async function toggleConfigActive(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    isActive: boolean,
    session?: ClientSession,
  ): Promise<IConfig | null> {
    const Config = mongoose.models.Config as Model<IConfig>;

    const query = Config.findOneAndUpdate(
      { principalType, principalId: principalId.toString() },
      { $set: { isActive } },
      { new: true },
    );

    if (session) {
      query.session(session);
    }

    return await query;
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
