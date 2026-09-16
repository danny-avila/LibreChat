import { logger } from '@librechat/data-schemas';
import { FileSources } from 'librechat-data-provider';
import type { Agent, AgentAvatar } from 'librechat-data-provider';

const MAX_AVATAR_REFRESH_AGENTS: number = 1000;
const AVATAR_REFRESH_BATCH_SIZE: number = 20;
/** Maximum number of per-agent coverage deadlines retained for one user. */
const MAX_AVATAR_REFRESH_COVERAGE_IDS: number = MAX_AVATAR_REFRESH_AGENTS;

export { MAX_AVATAR_REFRESH_AGENTS, AVATAR_REFRESH_BATCH_SIZE, MAX_AVATAR_REFRESH_COVERAGE_IDS };

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
  /** Maps each covered agent ID to the absolute time at which its coverage expires. */
  coveredIds: Record<string, number>;
};

type LegacyAvatarRefreshCacheEntry = {
  urlCache?: Record<string, string>;
  coveredIds?: string[] | Record<string, number>;
};

const getAvatarRefreshCoverage = (
  entry: unknown,
  now: number,
  coverageTtl: number,
): Record<string, number> => {
  if (!entry || typeof entry !== 'object') {
    return {};
  }

  const cacheEntry = entry as LegacyAvatarRefreshCacheEntry;
  const coveredIds = cacheEntry.coveredIds;
  if (coveredIds && !Array.isArray(coveredIds) && typeof coveredIds === 'object') {
    return Object.fromEntries(
      Object.entries(coveredIds).filter(
        ([, expiresAt]) => Number.isFinite(expiresAt) && expiresAt > now,
      ),
    );
  }

  const legacyIds = Array.isArray(coveredIds) ? coveredIds : Object.keys(cacheEntry.urlCache ?? {});
  const expiresAt = now + Math.max(0, coverageTtl);
  return Object.fromEntries(
    legacyIds.filter((id) => typeof id === 'string').map((id) => [id, expiresAt]),
  );
};

export const getAvatarRefreshCoveredIds = (entry: unknown, now: number = Date.now()): string[] =>
  Object.keys(getAvatarRefreshCoverage(entry, now, 0));

const getAvatarRefreshCacheTtl = (
  entry: AvatarRefreshCacheEntry,
  now: number,
  fallbackTtl: number,
): number => {
  const furthestExpiry = Math.max(...Object.values(entry.coveredIds), now);
  return Math.max(1, furthestExpiry - now || fallbackTtl);
};

export type RefreshS3UrlFn = (avatar: AgentAvatar) => Promise<string | undefined>;

export type UpdateAgentFn = (params: { id: string; avatar: AgentAvatar }) => Promise<unknown>;

export type AvatarRefreshCache = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: AvatarRefreshCacheEntry, ttl: number) => Promise<unknown>;
};

/* Every page for one user starts from the snapshot its request read before the list
   query, so merging into that snapshot would let whichever page finishes last drop the
   coverage and refreshed URLs the others added, and the next response would repeat their
   S3 work. Re-reading here narrows the overlap to the gap between this read and the
   write, instead of spanning the whole refresh. A failed read leaves the caller's
   snapshot in place, which is the behaviour this had before. */
const readLatestRefreshEntry = async (
  cache: AvatarRefreshCache,
  refreshKey: string,
  snapshot: unknown,
): Promise<unknown> => {
  try {
    return (await cache.get(refreshKey)) ?? snapshot;
  } catch (err) {
    logger.error('[resolveAvatarRefresh] Error re-reading the avatar refresh cache: %o', err);
    return snapshot;
  }
};

export type ResolveAvatarRefreshParams = {
  agents: Agent[];
  userId: string;
  cachedRefreshEntry: unknown;
  cache: AvatarRefreshCache;
  refreshKey: string;
  cacheTtl: number;
  refreshS3Url: RefreshS3UrlFn;
  updateAgent: UpdateAgentFn;
};

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

/**
 * Resolves the cache and refresh work for one already-paginated agent page.
 * Cache coverage is page-independent: each response contributes the rows it saw,
 * so later pages can refresh rows absent from earlier responses.
 */
export const resolveAvatarRefresh = async ({
  agents,
  userId,
  cachedRefreshEntry,
  cache,
  refreshKey,
  cacheTtl,
  refreshS3Url,
  updateAgent,
}: ResolveAvatarRefreshParams): Promise<AvatarRefreshCacheEntry | null> => {
  const now = Date.now();
  const isValidCachedRefresh =
    cachedRefreshEntry != null &&
    typeof cachedRefreshEntry === 'object' &&
    (cachedRefreshEntry as Partial<AvatarRefreshCacheEntry>).urlCache != null;
  const cachedCoverage = getAvatarRefreshCoverage(cachedRefreshEntry, now, cacheTtl);
  const cachedCoveredIds = Object.keys(cachedCoverage);
  const refreshAgents = selectAvatarRefreshAgents(agents, cachedCoveredIds);

  if (!refreshAgents.length && isValidCachedRefresh) {
    logger.debug(
      '[resolveAvatarRefresh] S3 avatar refresh already checked for this page, skipping',
    );
    return {
      urlCache: Object.fromEntries(
        Object.entries(
          (cachedRefreshEntry as Partial<AvatarRefreshCacheEntry>).urlCache ?? {},
        ).filter(([id]) => cachedCoverage[id] != null),
      ),
      coveredIds: cachedCoverage,
    };
  }

  try {
    const { urlCache, coveredIds } = await refreshListAvatars({
      agents: refreshAgents,
      userId,
      refreshS3Url,
      updateAgent,
    });
    const latestEntry = await readLatestRefreshEntry(cache, refreshKey, cachedRefreshEntry);
    const refreshEntry = mergeAvatarRefreshCacheEntry(
      latestEntry,
      { urlCache, coveredIds },
      cacheTtl,
    );
    const refreshedAt = Date.now();
    await cache.set(
      refreshKey,
      refreshEntry,
      getAvatarRefreshCacheTtl(refreshEntry, refreshedAt, cacheTtl),
    );
    return refreshEntry;
  } catch (err) {
    logger.error('[resolveAvatarRefresh] Error refreshing avatars for list page: %o', err);
    return null;
  }
};

export const mergeAvatarRefreshCacheEntry = (
  previous: unknown,
  stats: Pick<RefreshStats, 'urlCache' | 'coveredIds'>,
  coverageTtl: number = 30 * 60 * 1000,
  now: number = Date.now(),
): AvatarRefreshCacheEntry => {
  const previousEntry =
    previous && typeof previous === 'object'
      ? (previous as Partial<AvatarRefreshCacheEntry>)
      : undefined;
  const coverage = getAvatarRefreshCoverage(previous, now, coverageTtl);
  const expiresAt = now + Math.max(0, coverageTtl);
  for (const id of stats.coveredIds) {
    delete coverage[id];
    coverage[id] = expiresAt;
  }
  // Expired entries are removed first; when full, retain the furthest deadlines.

  const retainedCoverage = Object.entries(coverage)
    .filter(([, deadline]) => deadline > now)
    .sort(([, firstDeadline], [, secondDeadline]) => firstDeadline - secondDeadline)
    .slice(-MAX_AVATAR_REFRESH_COVERAGE_IDS);
  const coveredIds = Object.fromEntries(retainedCoverage);
  const retainedIds = new Set(Object.keys(coveredIds));
  const urlCache = Object.fromEntries(
    Object.entries(previousEntry?.urlCache ?? {}).filter(([id]) => retainedIds.has(id)),
  );
  for (const [id, url] of Object.entries(stats.urlCache)) {
    if (retainedIds.has(id)) {
      urlCache[id] = url;
    }
  }

  return { urlCache, coveredIds };
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
            await updateAgent({
              id: agent.id,
              avatar: { filepath: newPath, source: agent.avatar.source },
            });
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
