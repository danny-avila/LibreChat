import { logger } from '@librechat/data-schemas';
import { FileSources } from 'librechat-data-provider';
import type { Agent, AgentAvatar } from 'librechat-data-provider';

const MAX_AVATAR_REFRESH_AGENTS = 1000;
const AVATAR_REFRESH_BATCH_SIZE = 20;

export { MAX_AVATAR_REFRESH_AGENTS, AVATAR_REFRESH_BATCH_SIZE };

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
  updateAgent,
}: RefreshListAvatarsParams): Promise<RefreshStats> => {
  const stats: RefreshStats = {
    updated: 0,
    not_s3: 0,
    no_id: 0,
    no_change: 0,
    s3_error: 0,
    persist_error: 0,
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

        try {
          logger.debug('[refreshListAvatars] Refreshing S3 avatar for agent: %s', agent._id);
          const newPath = await refreshS3Url(agent.avatar);

          if (newPath && newPath !== agent.avatar.filepath) {
            try {
              await updateAgent(
                { id: agent.id },
                {
                  avatar: {
                    filepath: newPath,
                    source: agent.avatar.source,
                  },
                },
                {
                  updatingUserId: userId,
                  skipVersioning: true,
                },
              );
              stats.updated++;
            } catch (persistErr) {
              logger.error('[refreshListAvatars] Avatar refresh persist error: %o', persistErr);
              stats.persist_error++;
            }
          } else {
            stats.no_change++;
          }
        } catch (err) {
          logger.error('[refreshListAvatars] S3 avatar refresh error: %o', err);
          stats.s3_error++;
        }
      }),
    );
  }

  logger.info('[refreshListAvatars] Avatar refresh summary: %o', stats);
  return stats;
};
