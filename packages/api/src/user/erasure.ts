import mongoose from 'mongoose';
import { logger } from '@librechat/data-schemas';
import type { TCheckpointerConfig, MCPOptions } from 'librechat-data-provider';
import type { AllMethods, IMongoFile } from '@librechat/data-schemas';
import type { CheckpointDeletion } from '~/agents/checkpoints/deletion';
import type { OAuthAclSubject } from '../mcp/oauth/cleanup';
import {
  cleanupDeletedMCPServerOAuthUsers,
  prepareMCPServerOAuthDeletion,
} from '../mcp/oauth/cleanup';

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
  | 'findMCPServerOAuthTokenUserIds'
  | 'findMCPServerViewerEntries'
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
  /**
   * Cleans OAuth credentials, cached catalogs and connections of every user a removed MCP server
   * was shared with. Omitted when the host has no OAuth runtime; the owner hooks above still run.
   */
  mcpOAuth?: MCPOAuthErasureHooks;
  /** Runs once the user's sessions are revoked, before the rest of the cascade can fail. */
  onSessionsDeleted?: () => void;
}

export interface MCPOAuthErasureHooks {
  /** Config of the server before it is removed, so stored tokens can still be revoked. */
  getServerConfig?: (serverName: string) => Promise<MCPOptions | undefined>;
  getUserPrincipals: (userId: string) => Promise<OAuthAclSubject[]>;
  resolveAllowlists: (
    userId: string,
  ) => Promise<{ allowedDomains?: string[] | null; allowedAddresses?: string[] | null }>;
  fenceAndDisconnectUser?: (userId: string, serverName: string) => Promise<void>;
  uninstallOAuthMCP: (
    userId: string,
    pluginKey: string,
    appConfig: {
      mcpSettings?: { allowedDomains?: string[] | null; allowedAddresses?: string[] | null };
    },
    serverConfig?: MCPOptions,
  ) => Promise<void>;
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
  | 'findMCPServerOAuthTokenUserIds'
  | 'findMCPServerViewerEntries'
  | 'mcpOAuth'
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
      if (!serverName) {
        return;
      }
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

  const oauth = deps.mcpOAuth;
  const named = servers.filter((server) => server.serverName);
  /** Shared users are only discoverable from the ACLs and tokens that the delete removes. */
  const prepared = oauth
    ? await Promise.all(
        named.map(async ({ id, serverName }) => ({
          serverName,
          serverConfig: await oauth.getServerConfig?.(serverName),
          snapshot: await prepareMCPServerOAuthDeletion({
            getTokenUserIds: () => deps.findMCPServerOAuthTokenUserIds(serverName),
            getAclEntries: () => deps.findMCPServerViewerEntries(id),
          }),
        })),
      )
    : [];

  const cleanupSharedUsers = async (removed: typeof prepared): Promise<number> => {
    if (!oauth) {
      return 0;
    }
    const results = await Promise.allSettled(
      removed.map(({ serverName, serverConfig, snapshot }) =>
        cleanupDeletedMCPServerOAuthUsers({
          ownerUserId: userId,
          serverName,
          serverConfig,
          snapshot,
          getTokenUserIds: () => deps.findMCPServerOAuthTokenUserIds(serverName),
          getUserPrincipals: oauth.getUserPrincipals,
          resolveAllowlists: oauth.resolveAllowlists,
          fenceAndDisconnectUser: (candidateId) =>
            oauth.fenceAndDisconnectUser?.(candidateId, serverName) ?? Promise.resolve(),
          uninstallOAuthMCP: oauth.uninstallOAuthMCP,
        }),
      ),
    );
    const failures = results.filter((result) => result.status === 'rejected');
    for (const failure of failures) {
      logger.error(`[eraseUserData] MCP OAuth cleanup failed for user ${userId}`, failure.reason);
    }
    return failures.length;
  };

  try {
    await deps.deleteMCPServersWithAcl(servers.map((s) => s.id));
  } catch (error) {
    /**
     * A retry sees a server whose document is already gone only as an unnamed ACL, so shared
     * users of servers that did go away are cleaned now, while their names are still known.
     */
    if (prepared.length > 0) {
      const remaining = new Set(
        (await deps.findUserErasableMCPServers(userId).catch(() => servers)).map(
          (server) => server.serverName,
        ),
      );
      await cleanupSharedUsers(prepared.filter(({ serverName }) => !remaining.has(serverName)));
    }
    throw error;
  }
  /** Shared-user credentials cannot be rediscovered once the server is gone, so surface the failure. */
  if ((await cleanupSharedUsers(prepared)) > 0) {
    throw new Error('MCP OAuth cleanup failed for users of a removed server');
  }
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
  /** Before user keys: provider-stored files need the user's own assistants credentials. */
  const files = await deps.getFiles({ user: userId });
  try {
    await deps.deleteStoredFiles(files ?? []);
  } catch (error) {
    logger.error(`[eraseUserData] Failed to delete stored files for user ${userId}`, error);
  }
  await deps.deleteFiles([], userId);
  await deps.deleteAllUserSessions({ userId });
  deps.onSessionsDeleted?.();
  await deps.deleteRefreshTokenBridges({ userId, tenantId });
  if (tenantId) {
    /** Bridges written before tenancy carry no tenantId, and the user id is globally unique. */
    await deps.deleteRefreshTokenBridges({ userId });
  }
  await deps.deletePasskeysByUser(userId);
  if (!keepTransactions) {
    await deps.deleteTransactions({ user: userId });
  }
  await deps.deleteUserKey({ userId, all: true });
  await deps.deleteBalances({ user: userObjectId });
  await deps.deletePresets(userId);
  await deps.deleteAllUserPluginAuths(userId);
  await deps.deleteSharedLinks(userId);
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
