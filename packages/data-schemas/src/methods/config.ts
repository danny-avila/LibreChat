import { Types } from 'mongoose';
import { PrincipalType, PrincipalModel } from 'librechat-data-provider';
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
      principalId,
      isActive: true,
    });
    if (session) {
      query.session(session);
    }
    return await query.lean();
  }

  async function getApplicableConfigs(
    principals?: Array<{ principalType: string; principalId?: string | Types.ObjectId }>,
    session?: ClientSession,
  ): Promise<IConfig[]> {
    if (!principals || principals.length === 0) {
      return [];
    }

    const Config = mongoose.models.Config as Model<IConfig>;

    const principalsQuery = principals
      .map((p) => ({
        principalType: p.principalType,
        principalId: p.principalId,
      }))
      .filter((p) => p.principalId !== undefined);

    if (principalsQuery.length === 0) {
      return [];
    }

    const configQuery = Config.find({
      $or: principalsQuery,
      isActive: true,
    });

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
      principalId,
    };

    const update = {
      $set: {
        principalModel,
        overrides,
        priority,
        isActive: true,
      },
    };

    const options = {
      upsert: true,
      new: true,
      ...(session ? { session } : {}),
    };

    return await Config.findOneAndUpdate(query, update, options);
  }

  async function deleteConfig(
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IConfig | null> {
    const Config = mongoose.models.Config as Model<IConfig>;

    const query = Config.findOneAndDelete({
      principalType,
      principalId,
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
      { principalType, principalId },
      { $set: { isActive } },
      { new: true },
    );

    if (session) {
      query.session(session);
    }

    return await query;
  }

  return {
    findConfigByPrincipal,
    getApplicableConfigs,
    upsertConfig,
    deleteConfig,
    toggleConfigActive,
  };
}

export type ConfigMethods = ReturnType<typeof createConfigMethods>;
