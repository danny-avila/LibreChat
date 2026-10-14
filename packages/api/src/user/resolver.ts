import { runAsSystem, tenantStorage } from '@librechat/data-schemas';
import type { TCheckpointerConfig } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { AdminErasureContext, AdminErasureTarget } from '~/admin/users';
import type { UserErasureDeps, MCPOAuthErasureHooks } from './erasure';

type ErasureBaseDeps = Omit<
  UserErasureDeps,
  | 'openCheckpointDeletion'
  | 'deleteSharedLinks'
  | 'deleteStoredFiles'
  | 'invalidateMCPServerTools'
  | 'disconnectMCPServer'
  | 'mcpOAuth'
>;

/** The stored-file fields deletion reads, without the document members of the persisted model. */
export type ErasureFile = Pick<
  IMongoFile,
  'file_id' | 'filepath' | 'filename' | 'source' | 'type' | 'bytes' | 'embedded' | 'temp_file_id'
>;

export interface ErasureResolverDeps {
  /** Shared-server OAuth cleanup is wired only when the host has an MCP OAuth runtime. */
  mcpOAuth?: {
    getRegistry: () => {
      getServerConfig: (
        serverName: string,
        userId: string,
      ) => ReturnType<NonNullable<MCPOAuthErasureHooks['getServerConfig']>>;
      resolveAllowlists: (options: {
        userId: string;
      }) => ReturnType<MCPOAuthErasureHooks['resolveAllowlists']>;
    };
    getUserPrincipals: (params: {
      userId: string;
    }) => ReturnType<MCPOAuthErasureHooks['getUserPrincipals']>;
    uninstallOAuthMCP: MCPOAuthErasureHooks['uninstallOAuthMCP'];
  };
  /** Data-layer methods used by the cascade. */
  db: ErasureBaseDeps;
  getAppConfig: (options: {
    role?: string;
    userId: string;
    tenantId?: string;
    idOnTheSource?: string | null;
    failClosed?: boolean;
  }) => Promise<{ endpoints?: { agents?: { checkpointer?: TCheckpointerConfig } } } | undefined>;
  processDeleteRequest: (params: {
    req: Record<string, unknown>;
    files: ErasureFile[];
  }) => Promise<unknown>;
  invalidateCachedTools: (params: { userId: string; serverName: string }) => Promise<unknown>;
  getMCPManager: () =>
    | { disconnectUserConnection: (userId: string, serverName: string) => Promise<unknown> }
    | null
    | undefined;
  openCheckpointDeletion: UserErasureDeps['openCheckpointDeletion'];
  deleteSharedLinks: UserErasureDeps['deleteSharedLinks'];
}

/**
 * Builds the `eraseUserData` dependencies for an account deleted by someone else. Stored files
 * are removed with a request that carries the target user, since provider clients and
 * credentials are resolved from the request user, not the calling admin.
 */
export function createErasureResolver(deps: ErasureResolverDeps) {
  return async function resolveErasure({
    id,
    role,
    tenantId,
    idOnTheSource,
    profile,
  }: AdminErasureTarget): Promise<AdminErasureContext> {
    /** A failed override lookup must abort the deletion, not fall back to a base config that cannot reach the target's storage. */
    const appConfig = await deps.getAppConfig({
      role,
      userId: id,
      tenantId,
      idOnTheSource,
      failClosed: true,
    });
    const oauth = deps.mcpOAuth;
    /** The calling admin's tenant context must not decide whose rows an id-keyed lookup reads. */
    const inTargetTenant = <T>(operation: () => Promise<T>): Promise<T> =>
      tenantId ? tenantStorage.run({ tenantId, userId: id }, operation) : runAsSystem(operation);
    const fileRequest = {
      user: { ...profile, id, _id: id, role, tenantId },
      /** Assistants client setup reads these Express request fields. */
      baseUrl: '',
      query: {},
      body: {},
      config: appConfig,
    };
    return {
      checkpointer: appConfig?.endpoints?.agents?.checkpointer,
      deps: {
        ...deps.db,
        openCheckpointDeletion: deps.openCheckpointDeletion,
        deleteSharedLinks: deps.deleteSharedLinks,
        deleteUserAgents: (userId) => inTargetTenant(async () => deps.db.deleteUserAgents(userId)),
        findMCPServerOAuthTokenUserIds: (serverName) =>
          inTargetTenant(async () => deps.db.findMCPServerOAuthTokenUserIds(serverName)),
        findMCPServerViewerEntries: (serverId) =>
          inTargetTenant(async () => deps.db.findMCPServerViewerEntries(serverId)),
        deleteStoredFiles: (files) =>
          inTargetTenant(async () => deps.processDeleteRequest({ req: fileRequest, files })),
        invalidateMCPServerTools: (serverName) =>
          deps.invalidateCachedTools({ userId: id, serverName }),
        disconnectMCPServer: async (serverName) => {
          await deps.getMCPManager()?.disconnectUserConnection(id, serverName);
        },
        mcpOAuth: oauth && {
          getServerConfig: (serverName) =>
            inTargetTenant(async () => oauth.getRegistry().getServerConfig(serverName, id)),
          getUserPrincipals: (candidateId) =>
            inTargetTenant(async () => oauth.getUserPrincipals({ userId: candidateId })),
          resolveAllowlists: (candidateId) =>
            inTargetTenant(async () =>
              oauth.getRegistry().resolveAllowlists({ userId: candidateId }),
            ),
          uninstallOAuthMCP: (candidateId, pluginKey, cleanupConfig, serverConfig) =>
            inTargetTenant(async () =>
              oauth.uninstallOAuthMCP(candidateId, pluginKey, cleanupConfig, serverConfig),
            ),
          fenceAndDisconnectUser: async (candidateId, serverName) => {
            await deps.invalidateCachedTools({ userId: candidateId, serverName });
            await deps.getMCPManager()?.disconnectUserConnection(candidateId, serverName);
          },
        },
      },
    };
  };
}
