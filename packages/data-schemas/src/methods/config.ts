import { Types } from 'mongoose';
import { PrincipalType, PrincipalModel } from 'librechat-data-provider';
import type { Model, ClientSession } from 'mongoose';
import type { IConfig } from '~/types';

export function createConfigMethods(mongoose: typeof import('mongoose')) {
  /**
   * Find a config by principal
   * @param principalType - The type of principal
   * @param principalId - The ID of the principal
   * @param session - Optional MongoDB session for transactions
   * @returns The config document or null if not found
   */
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

  /**
   * Get all applicable configurations based on principals
   * @param principals - Optional list of principals (from getUserPrincipals)
   * @param session - Optional MongoDB session for transactions
   * @returns Array of applicable config documents
   */
  async function getApplicableConfigs(
    principals?: Array<{ principalType: string; principalId?: string | Types.ObjectId }>,
    session?: ClientSession,
  ): Promise<IConfig[]> {
    if (!principals || principals.length === 0) {
      return [];
    }

    const Config = mongoose.models.Config as Model<IConfig>;

    // Build query to get all configs matching any of the principals
    const principalsQuery = principals
      .map((p) => ({
        principalType: p.principalType,
        principalId: p.principalId,
      }))
      .filter((p) => p.principalId !== undefined); // Filter out PUBLIC since configs don't apply to PUBLIC

    if (principalsQuery.length === 0) {
      return [];
    }

    // Single query to get all applicable configs
    const configQuery = Config.find({
      $or: principalsQuery,
      isActive: true,
    });

    if (session) {
      configQuery.session(session);
    }

    return await configQuery.lean();
  }

  /**
   * Create or update a config for a principal
   * @param principalType - The type of principal
   * @param principalId - The ID of the principal
   * @param principalModel - The model reference
   * @param overrides - The configuration overrides
   * @param priority - The priority level
   * @param session - Optional MongoDB session for transactions
   * @returns The created or updated config document
   */
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

  /**
   * Delete a config for a principal
   * @param principalType - The type of principal
   * @param principalId - The ID of the principal
   * @param session - Optional MongoDB session for transactions
   * @returns The deleted config document or null
   */
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

  /**
   * Toggle active status of a config
   * @param principalType - The type of principal
   * @param principalId - The ID of the principal
   * @param isActive - Whether the config should be active
   * @param session - Optional MongoDB session for transactions
   * @returns The updated config document or null
   */
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
