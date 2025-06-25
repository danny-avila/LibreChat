import type { DeleteResult, Model } from 'mongoose';
import type { IPluginAuth } from '~/schema/pluginAuth';
import type {
  FindPluginAuthsByKeysParams,
  UpdatePluginAuthParams,
  DeletePluginAuthParams,
  FindPluginAuthParams,
} from '~/types';

// Factory function that takes mongoose instance and returns the methods
export function createPluginAuthMethods(mongoose: typeof import('mongoose')) {
  const PluginAuth: Model<IPluginAuth> = mongoose.models.PluginAuth;

  /**
   * Finds a single plugin auth entry by userId and authField
   */
  async function findOnePluginAuth({
    userId,
    authField,
  }: FindPluginAuthParams): Promise<IPluginAuth | null> {
    try {
      return await PluginAuth.findOne({ userId, authField }).lean();
    } catch (error) {
      throw new Error(
        `Failed to find plugin auth: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Finds multiple plugin auth entries by userId and pluginKeys
   */
  async function findPluginAuthsByKeys({
    userId,
    pluginKeys,
  }: FindPluginAuthsByKeysParams): Promise<IPluginAuth[]> {
    try {
      if (!pluginKeys || pluginKeys.length === 0) {
        return [];
      }

      return await PluginAuth.find({
        userId,
        pluginKey: { $in: pluginKeys },
      }).lean();
    } catch (error) {
      throw new Error(
        `Failed to find plugin auths: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Updates or creates a plugin auth entry
   */
  async function updatePluginAuth({
    userId,
    authField,
    pluginKey,
    value,
  }: UpdatePluginAuthParams): Promise<IPluginAuth> {
    try {
      const existingAuth = await PluginAuth.findOne({ userId, pluginKey, authField }).lean();

      if (existingAuth) {
        return await PluginAuth.findOneAndUpdate(
          { userId, pluginKey, authField },
          { $set: { value } },
          { new: true, upsert: true },
        ).lean();
      } else {
        const newPluginAuth = await new PluginAuth({
          userId,
          authField,
          value,
          pluginKey,
        });
        await newPluginAuth.save();
        return newPluginAuth.toObject();
      }
    } catch (error) {
      throw new Error(
        `Failed to update plugin auth: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Deletes plugin auth entries based on provided parameters
   */
  async function deletePluginAuth({
    userId,
    authField,
    pluginKey,
    all = false,
  }: DeletePluginAuthParams): Promise<DeleteResult> {
    try {
      if (all) {
        const filter: DeletePluginAuthParams = { userId };
        if (pluginKey) {
          filter.pluginKey = pluginKey;
        }
        return await PluginAuth.deleteMany(filter);
      }

      if (!authField) {
        throw new Error('authField is required when all is false');
      }

      return await PluginAuth.deleteOne({ userId, authField });
    } catch (error) {
      throw new Error(
        `Failed to delete plugin auth: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Deletes all plugin auth entries for a user
   */
  async function deleteAllUserPluginAuths(userId: string): Promise<DeleteResult> {
    try {
      return await PluginAuth.deleteMany({ userId });
    } catch (error) {
      throw new Error(
        `Failed to delete all user plugin auths: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  return {
    findOnePluginAuth,
    findPluginAuthsByKeys,
    updatePluginAuth,
    deletePluginAuth,
    deleteAllUserPluginAuths,
  };
}

export type PluginAuthMethods = ReturnType<typeof createPluginAuthMethods>;
