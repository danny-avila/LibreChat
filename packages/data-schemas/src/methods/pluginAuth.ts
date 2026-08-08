import { Constants } from 'librechat-data-provider';
import type { DeleteResult, Model } from 'mongoose';
import type {
  FindPluginAuthsByKeysParams,
  UpdatePluginAuthParams,
  DeletePluginAuthParams,
  FindPluginAuthParams,
  IPluginAuth,
} from '~/types';
import { getMCPAuthorityConsistencyModule } from './mcpAuthority/consistency';

function isMCPPluginKey(pluginKey: string | undefined): boolean {
  return pluginKey?.startsWith(Constants.mcp_prefix) ?? false;
}

// Factory function that takes mongoose instance and returns the methods
export function createPluginAuthMethods(mongoose: typeof import('mongoose')): {
  findOnePluginAuth: ({
    userId,
    authField,
    pluginKey,
  }: FindPluginAuthParams) => Promise<IPluginAuth | null>;
  findPluginAuthsByKeys: ({
    userId,
    pluginKeys,
  }: FindPluginAuthsByKeysParams) => Promise<IPluginAuth[]>;
  updatePluginAuth: ({
    userId,
    authField,
    pluginKey,
    value,
  }: UpdatePluginAuthParams) => Promise<IPluginAuth>;
  deletePluginAuth: ({
    userId,
    authField,
    pluginKey,
    all,
  }: DeletePluginAuthParams) => Promise<DeleteResult>;
  deleteAllUserPluginAuths: (userId: string) => Promise<DeleteResult>;
} {
  const authorityMutationGate = getMCPAuthorityConsistencyModule(mongoose);
  /**
   * Finds a single plugin auth entry by userId and authField (and optionally pluginKey)
   */
  async function findOnePluginAuth({
    userId,
    authField,
    pluginKey,
  }: FindPluginAuthParams): Promise<IPluginAuth | null> {
    try {
      const PluginAuth: Model<IPluginAuth> = mongoose.models.PluginAuth;
      return await PluginAuth.findOne({
        userId,
        authField,
        ...(pluginKey && { pluginKey }),
      }).lean<IPluginAuth>();
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

      const PluginAuth: Model<IPluginAuth> = mongoose.models.PluginAuth;
      return await PluginAuth.find({
        userId,
        pluginKey: { $in: pluginKeys },
      }).lean<IPluginAuth[]>();
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
      const write = async (): Promise<IPluginAuth> => {
        const PluginAuth: Model<IPluginAuth> = mongoose.models.PluginAuth;
        const existingAuth = await PluginAuth.findOne({
          userId,
          pluginKey,
          authField,
        }).lean<IPluginAuth>();

        if (existingAuth) {
          return await PluginAuth.findOneAndUpdate(
            { userId, pluginKey, authField },
            { $set: { value } },
            { new: true, upsert: true },
          ).lean<IPluginAuth>();
        }
        const newPluginAuth = await new PluginAuth({
          userId,
          authField,
          value,
          pluginKey,
        });
        await newPluginAuth.save();
        return newPluginAuth.toObject();
      };
      if (!isMCPPluginKey(pluginKey)) {
        return await write();
      }
      return (await authorityMutationGate.mutateMCPAuthority(write)).result;
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
      if (!authField) {
        if (!all) {
          throw new Error('authField is required when all is false');
        }
      }
      const write = async (): Promise<DeleteResult> => {
        const PluginAuth: Model<IPluginAuth> = mongoose.models.PluginAuth;
        if (all) {
          return await PluginAuth.deleteMany({
            userId,
            ...(pluginKey && { pluginKey }),
          });
        }
        return await PluginAuth.deleteOne({
          userId,
          authField,
          ...(pluginKey && { pluginKey }),
        });
      };
      const affectsMCPAuthority = pluginKey === undefined || isMCPPluginKey(pluginKey);
      if (!affectsMCPAuthority) {
        return await write();
      }
      return (await authorityMutationGate.mutateMCPAuthority(write)).result;
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
      const PluginAuth: Model<IPluginAuth> = mongoose.models.PluginAuth;
      return (
        await authorityMutationGate.mutateMCPAuthority(
          async () => await PluginAuth.deleteMany({ userId }),
        )
      ).result;
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
