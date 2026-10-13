import type { TCheckpointerConfig } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { AdminErasureContext, AdminErasureTarget } from '~/admin/users';
import type { UserErasureDeps } from './erasure';

type ErasureBaseDeps = Omit<
  UserErasureDeps,
  | 'openCheckpointDeletion'
  | 'deleteSharedLinks'
  | 'deleteStoredFiles'
  | 'invalidateMCPServerTools'
  | 'disconnectMCPServer'
>;

export interface ErasureResolverDeps {
  /** Data-layer methods used by the cascade. */
  db: ErasureBaseDeps;
  getAppConfig: (options: {
    role?: string;
    userId: string;
    tenantId?: string;
  }) => Promise<{ endpoints?: { agents?: { checkpointer?: TCheckpointerConfig } } } | undefined>;
  processDeleteRequest: (params: {
    req: Record<string, unknown>;
    files: IMongoFile[];
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
  }: AdminErasureTarget): Promise<AdminErasureContext> {
    const appConfig = await deps.getAppConfig({ role, userId: id, tenantId });
    const fileRequest = {
      user: { id, _id: id, role, tenantId },
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
        deleteStoredFiles: (files) => deps.processDeleteRequest({ req: fileRequest, files }),
        invalidateMCPServerTools: (serverName) =>
          deps.invalidateCachedTools({ userId: id, serverName }),
        disconnectMCPServer: async (serverName) => {
          await deps.getMCPManager()?.disconnectUserConnection(id, serverName);
        },
      },
    };
  };
}
