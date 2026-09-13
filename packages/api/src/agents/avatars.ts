import { logger } from '@librechat/data-schemas';
import { FileSources } from 'librechat-data-provider';
import type { Agent, AgentAvatar } from 'librechat-data-provider';

const MAX_AVATAR_REFRESH_AGENTS = 1000;
const AVATAR_REFRESH_BATCH_SIZE = 20;

export { MAX_AVATAR_REFRESH_AGENTS, AVATAR_REFRESH_BATCH_SIZE };

/**
 * Selects the agents whose S3 avatar URLs should be refreshed for one list response.
 * The caller supplies the already-paginated page, so refresh work follows the requested
 * ordering while retaining a hard upper bound for unusually large page limits.
 */
export const selectAvatarRefreshAgents = (
  agents: Agent[] | null | undefined,
  coveredIds: Iterable<string> = [],
): Agent[] => {
  const covered = new Set(coveredIds);
  return (agents ?? [])
    .filter(
      (agent) =>
        agent?.avatar?.source === FileSources.s3 &&
        Boolean(agent?.avatar?.filepath) &&
        Boolean(agent?.id) &&
        !covered.has(agent.id),
    )
    .slice(0, MAX_AVATAR_REFRESH_AGENTS);
};

export type AvatarRefreshCacheEntry = {
  urlCache: Record<string, string>;
  coveredIds: string[];
};

export const getAvatarRefreshCoveredIds = (entry: unknown): string[] => {
  if (!entry || typeof entry !== 'object') {
    return [];
  }

  const cacheEntry = entry as Partial<AvatarRefreshCacheEntry>;
  if (Array.isArray(cacheEntry.coveredIds)) {
    return cacheEntry.coveredIds;
  }

  return Object.keys(cacheEntry.urlCache ?? {});
};

export type RefreshS3UrlFn = (avatar: AgentAvatar) => Promise<string | undefined>;

export type UpdateAgentFn = (
  searchParams: { id: string },
  updateData: { avatar: AgentAvatar },
  options: { updatingUserId: string; skipVersioning: boolean },
) => Promise<unknown>;

export type RefreshListAvatarsParams = {
  agents: Agent[];
  userId: string;
  refreshS3Url: RefreshS3UrlFn;
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
  /** IDs whose S3 URL refresh was attempted during this pass, including unchanged/error results. */
  coveredIds: string[];
};

export const mergeAvatarRefreshCacheEntry = (
  previous: unknown,
  stats: Pick<RefreshStats, 'urlCache' | 'coveredIds'>,
): AvatarRefreshCacheEntry => {
  const previousEntry =
    previous && typeof previous === 'object'
      ? (previous as Partial<AvatarRefreshCacheEntry>)
      : undefined;
  const coveredIds = getAvatarRefreshCoveredIds(previous);
  return {
    urlCache: { ...(previousEntry?.urlCache ?? {}), ...stats.urlCache },
    coveredIds: [...new Set([...coveredIds, ...stats.coveredIds])],
  };
};

/**
 * Opportunistically refreshes S3-backed avatars for agent list responses.
 * Processes agents in batches to prevent database connection pool exhaustion.
 * Only list responses are refreshed because they're the highest-traffic surface and
 * the avatar URLs have a short-lived TTL. Per-user cache coverage suppresses repeat
 * refreshes for agents already attempted within 30 minutes while allowing a later page
 * to refresh rows not yet covered.
 *
 * Any user with VIEW access to an agent can refresh its avatar URL. This ensures
 * avatars remain accessible even when the owner hasn't logged in recently.
 * The agents array should already be filtered to only include agents the user can access.
 */
export const refreshListAvatars = async ({
  agents,
  userId,
  refreshS3Url,
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
    coveredIds: [],
  };

  if (!agents?.length) {
    return stats;
  }

  logger.debug('[refreshListAvatars] Refreshing S3 avatars for agents: %d', agents.length);

  for (let i = 0; i < agents.length; i += AVATAR_REFRESH_BATCH_SIZE) {
    const batch = agents.slice(i, i + AVATAR_REFRESH_BATCH_SIZE);

    await Promise.all(
      batch.map(async (agent) => {
        if (agent?.avatar?.source !== FileSources.s3 || !agent?.avatar?.filepath) {
          stats.not_s3++;
          return;
        }

        if (!agent?.id) {
          logger.debug(
            '[refreshListAvatars] Skipping S3 avatar refresh for agent: %s, ID is not set',
            agent._id,
          );
          stats.no_id++;
          return;
        }
        stats.coveredIds.push(agent.id);

        try {
          logger.debug('[refreshListAvatars] Refreshing S3 avatar for agent: %s', agent._id);
          const newPath = await refreshS3Url(agent.avatar);

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
          logger.error('[refreshListAvatars] S3 avatar refresh error: %o', err);
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
