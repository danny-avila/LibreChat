import mongoose from 'mongoose';
import { logger } from '@librechat/data-schemas';
import type { AllMethods, IMongoFile } from '@librechat/data-schemas';
import type { TCheckpointerConfig } from 'librechat-data-provider';
import type { CheckpointDeletion } from '~/agents/checkpoints/deletion';

type ErasureMethods = Pick<
  AllMethods,
  | 'deleteConvos'
  | 'deleteMessages'
  | 'deleteAllUserSessions'
  | 'deletePasskeysByUser'
  | 'deleteTransactions'
  | 'deleteUserKey'
  | 'deleteBalances'
  | 'deletePresets'
  | 'deleteAllUserPluginAuths'
  | 'getFiles'
  | 'deleteFiles'
  | 'deleteToolCalls'
  | 'deleteUserAgents'
  | 'deleteAllAgentApiKeys'
  | 'deleteAssistants'
  | 'deleteConversationTags'
  | 'deleteAllUserMemories'
  | 'deleteUserPrompts'
  | 'deleteUserSkills'
  | 'findUserErasableMCPServers'
  | 'deleteMCPServersWithAcl'
  | 'deleteActions'
  | 'deleteTokens'
  | 'removeUserFromAllGroups'
  | 'deleteAclEntries'
  | 'deleteSchedulesByUser'
  | 'deleteUserChatProjects'
  | 'deleteUserToolFavorites'
  | 'deleteRefreshTokenBridges'
  | 'deleteAllAgentQueuedTurnsForUser'
>;

export interface UserErasureDeps extends ErasureMethods {
  openCheckpointDeletion: (
    userId: string,
    tenantId: string | undefined,
    rootConversationId: string | undefined,
    cfg?: TCheckpointerConfig,
  ) => Promise<CheckpointDeletion>;
  deleteSharedLinks: (userId: string) => Promise<unknown>;
  /** Removes stored file objects (local disk, S3, Firebase, vector store) before their metadata. */
  deleteStoredFiles: (files: IMongoFile[]) => Promise<unknown>;
  /** Runtime cleanup for a removed MCP server; each hook is best effort. */
  invalidateMCPServerTools?: (serverName: string) => Promise<unknown>;
  disconnectMCPServer?: (serverName: string) => Promise<unknown>;
}

export interface UserErasureParams {
  userId: string;
  tenantId?: string;
  checkpointer?: TCheckpointerConfig;
  /** Operator option to keep the transaction ledger; account self-deletion always erases it. */
  keepTransactions?: boolean;
}

export type MCPServerCleanupDeps = Pick<
  UserErasureDeps,
  | 'findUserErasableMCPServers'
  | 'deleteMCPServersWithAcl'
  | 'invalidateMCPServerTools'
  | 'disconnectMCPServer'
>;

/**
 * Deletes MCP servers solely owned by the user, plus legacy (pre-ACL) servers that only carry
 * the author field, and their ACL entries. Servers with other owners are left intact; the
 * user's own principal ACL entries are removed separately by the cascade. Runtime hooks are
 * best effort; a database failure propagates so the caller keeps the account and can retry.
 */
export async function deleteUserMCPServers(
  userId: string,
  deps: MCPServerCleanupDeps,
): Promise<void> {
  const servers = await deps.findUserErasableMCPServers(userId);
  if (servers.length === 0) {
    return;
  }

  await Promise.allSettled(
    servers.map(async ({ serverName }) => {
      try {
        await deps.invalidateMCPServerTools?.(serverName);
      } catch (error) {
        logger.warn(`[eraseUserData] Failed to invalidate tools for ${serverName}`, error);
      } finally {
        try {
          await deps.disconnectMCPServer?.(serverName);
        } catch (error) {
          logger.warn(`[eraseUserData] Failed to disconnect ${serverName}`, error);
        }
      }
    }),
  );

  await deps.deleteMCPServersWithAcl(servers.map((s) => s.id));
}

/**
 * The user-owned data cascade shared by account self-deletion and the operator CLI.
 *
 * Callers own everything around it: deletion fences, schedule suspension, generation aborts,
 * the final user document delete, and code environment cleanup after that commit. The cascade
 * is idempotent, so a failed attempt can be retried after the caller restores its fences.
 */
export async function eraseUserData(
  params: UserErasureParams,
  deps: UserErasureDeps,
): Promise<void> {
  const { userId, tenantId, checkpointer, keepTransactions = false } = params;
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const checkpointDeletion = await deps.openCheckpointDeletion(
    userId,
    tenantId,
    undefined,
    checkpointer,
  );
  await deps.deleteConvos(
    userId,
    {},
    {
      allowEmpty: true,
      beforeDelete: (ids) => checkpointDeletion.remember(ids),
    },
  );
  await checkpointDeletion.cleanup();
  await checkpointDeletion.acknowledge();

  await deps.deleteUserChatProjects(userId);
  await deps.deleteMessages({ user: userId });
  await deps.deleteAllAgentQueuedTurnsForUser({ user: userObjectId });
  await deps.deleteAllUserSessions({ userId });
  await deps.deleteRefreshTokenBridges({ userId, tenantId });
  await deps.deletePasskeysByUser(userId);
  if (!keepTransactions) {
    await deps.deleteTransactions({ user: userId });
  }
  await deps.deleteUserKey({ userId, all: true });
  await deps.deleteBalances({ user: userObjectId });
  await deps.deletePresets(userId);
  await deps.deleteAllUserPluginAuths(userId);
  await deps.deleteSharedLinks(userId);
  try {
    const files = await deps.getFiles({ user: userId });
    await deps.deleteStoredFiles(files ?? []);
  } catch (error) {
    logger.error(`[eraseUserData] Failed to delete stored files for user ${userId}`, error);
  }
  await deps.deleteFiles([], userId);
  await deps.deleteToolCalls(userId);
  await deps.deleteUserAgents(userId);
  await deps.deleteAllAgentApiKeys(userObjectId);
  await deps.deleteAssistants({ user: userId });
  await deps.deleteConversationTags({ user: userId });
  await deps.deleteUserToolFavorites(userId);
  await deps.deleteAllUserMemories(userId);
  await deps.deleteUserPrompts(userId);
  await deps.deleteUserSkills(userId);
  await deleteUserMCPServers(userId, deps);
  await deps.deleteActions({ user: userId });
  await deps.deleteTokens({ userId });
  await deps.removeUserFromAllGroups(userId);
  await deps.deleteAclEntries({ principalId: userObjectId });
  await deps.deleteSchedulesByUser(userId);
}
