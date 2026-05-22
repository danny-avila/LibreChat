import { logger } from '@librechat/data-schemas';
import { FileSources } from 'librechat-data-provider';
import type { Agent, AgentAvatar } from 'librechat-data-provider';

const MAX_AVATAR_REFRESH_AGENTS = 1000;
const AVATAR_REFRESH_BATCH_SIZE = 20;

export { MAX_AVATAR_REFRESH_AGENTS, AVATAR_REFRESH_BATCH_SIZE };

export type RefreshS3UrlFn = (avatar: AgentAvatar) => Promise<string | undefined>;

/** Generic signed URL refresh function, agnostic to storage provider */
export type RefreshUrlFn = (avatar: AgentAvatar) => Promise<string | undefined>;

export type UpdateAgentFn = (
  searchParams: { id: string },
  updateData: { avatar: AgentAvatar },
  options: { updatingUserId: string; skipVersioning: boolean },
) => Promise<unknown>;

export type RefreshListAvatarsParams = {
  agents: Agent[];
  userId: string;
  refreshS3Url: RefreshS3UrlFn;
  /** Optional Azure Blob URL refresher; when provided, Azure-backed avatars are also refreshed */
  refreshAzureUrl?: RefreshUrlFn;
  updateAgent: UpdateAgentFn;
};

export type RefreshStats = {
  updated: number;
  not_s3: number;
  no_id: number;
  no_change: number;
  s3_error: number;
  persist_error: number;
  /** Maps agentId to the latest valid presigned filepath for re-application on cache hits */
  urlCache: Record<string, string>;
};

/**
 * Opportunistically refreshes S3-backed avatars for agent list responses.
 * Processes agents in batches to prevent database connection pool exhaustion.
 * Only list responses are refreshed because they're the highest-traffic surface and
 * the avatar URLs have a short-lived TTL. The refresh is cached per-user for 30 minutes
 * so we refresh once per interval at most.
 *
 * Any user with VIEW access to an agent can refresh its avatar URL. This ensures
 * avatars remain accessible even when the owner hasn't logged in recently.
 * The agents array should already be filtered to only include agents the user can access.
 */
export const refreshListAvatars = async ({
  agents,
  userId,
  refreshS3Url,
  refreshAzureUrl,
  updateAgent,
}: RefreshListAvatarsParams): Promise<RefreshStats> => {
  const stats: RefreshStats = {
    updated: 0,
    not_s3: 0,
    no_id: 0,
    no_change: 0,
    s3_error: 0,
    persist_error: 0,
    urlCache: {},
  };

  if (!agents?.length) {
    return stats;
  }

  logger.debug('[refreshListAvatars] Refreshing S3 avatars for agents: %d', agents.length);

  for (let i = 0; i < agents.length; i += AVATAR_REFRESH_BATCH_SIZE) {
    const batch = agents.slice(i, i + AVATAR_REFRESH_BATCH_SIZE);

    await Promise.all(
      batch.map(async (agent) => {
        const source = agent?.avatar?.source;
        const isS3 = source === FileSources.s3;
        const isAzure = source === FileSources.azure_blob && !!refreshAzureUrl;

        if ((!isS3 && !isAzure) || !agent?.avatar?.filepath) {
          stats.not_s3++;
          return;
        }

        if (!agent?.id) {
          logger.debug(
            '[refreshListAvatars] Skipping avatar refresh for agent: %s, ID is not set',
            agent._id,
          );
          stats.no_id++;
          return;
        }

        const refreshFn = isS3 ? refreshS3Url : refreshAzureUrl!;

        try {
          logger.debug('[refreshListAvatars] Refreshing avatar for agent: %s', agent._id);
          const newPath = await refreshFn(agent.avatar);

          if (!newPath || newPath === agent.avatar.filepath) {
            stats.no_change++;
            return;
          }

          stats.urlCache[agent.id] = newPath;

          try {
            await updateAgent(
              { id: agent.id },
              { avatar: { filepath: newPath, source: agent.avatar.source } },
              { updatingUserId: userId, skipVersioning: true },
            );
            stats.updated++;
          } catch (persistErr) {
            logger.error('[refreshListAvatars] Avatar refresh persist error: %o', persistErr);
            stats.persist_error++;
          }
        } catch (err) {
          logger.error('[refreshListAvatars] Avatar refresh error: %o', err);
          stats.s3_error++;
        }
      }),
    );
  }

  const { urlCache: _urlCache, ...loggableStats } = stats;
  logger.info('[refreshListAvatars] Avatar refresh summary: %o', {
    ...loggableStats,
    urlCacheSize: Object.keys(_urlCache).length,
  });
  return stats;
};
