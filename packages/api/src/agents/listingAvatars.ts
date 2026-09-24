import { logger } from '@librechat/data-schemas';
import { FileSources } from 'librechat-data-provider';
import type { AgentAvatar } from 'librechat-data-provider';
import type { RefreshS3UrlFn } from './avatars';
import { AVATAR_REFRESH_BATCH_SIZE } from './avatars';

type AvatarRefreshEntry = { urlCache: Record<string, string> };
type ListedAgent = { id?: string; avatar?: AgentAvatar };

function validRefreshEntry(entry: unknown): entry is AvatarRefreshEntry {
  return (
    entry != null &&
    typeof entry === 'object' &&
    'urlCache' in entry &&
    entry.urlCache != null &&
    typeof entry.urlCache === 'object' &&
    !Array.isArray(entry.urlCache)
  );
}

/** Only ACL-scoped lists use the full-set refresh, which must finish before a cursor snapshot. */
export async function refreshAgentListAvatarsBeforePage(
  accessibleIds: string[] | null,
  cachedEntry: unknown,
  refreshAll: () => Promise<AvatarRefreshEntry | null>,
): Promise<AvatarRefreshEntry | null> {
  if (accessibleIds === null) {
    return validRefreshEntry(cachedEntry) ? cachedEntry : null;
  }
  return refreshAll();
}

/**
 * A manager has access to the whole tenant, but refreshing all of its avatars before each
 * search can presign and write hundreds of unrelated agents. Refresh only the visible page.
 * Do not persist these URL changes: updating `updatedAt` after taking a cursor snapshot would
 * reorder later pages, and legacy users without tenant context cannot safely update by public ID.
 */
export async function refreshManagedAgentListPageAvatars({
  accessibleIds,
  agents,
  cachedEntry,
  refreshS3Url,
  cacheSet,
  cacheKey,
  ttl,
}: {
  accessibleIds: string[] | null;
  agents: ListedAgent[];
  cachedEntry: AvatarRefreshEntry | null;
  refreshS3Url: RefreshS3UrlFn;
  cacheSet: (key: string, entry: AvatarRefreshEntry, ttl: number) => Promise<unknown>;
  cacheKey: string;
  ttl: number;
}): Promise<AvatarRefreshEntry | null> {
  if (accessibleIds !== null || agents.length === 0) {
    return cachedEntry;
  }

  const urlCache = { ...(cachedEntry?.urlCache ?? {}) };
  const pending = agents.filter(
    (agent) =>
      agent.id &&
      agent.avatar?.source === FileSources.s3 &&
      agent.avatar.filepath &&
      !Object.prototype.hasOwnProperty.call(urlCache, agent.id),
  );
  if (pending.length === 0) {
    return cachedEntry;
  }

  let changed = false;
  for (let index = 0; index < pending.length; index += AVATAR_REFRESH_BATCH_SIZE) {
    await Promise.all(
      pending.slice(index, index + AVATAR_REFRESH_BATCH_SIZE).map(async (agent) => {
        try {
          const url = await refreshS3Url(agent.avatar!);
          if (url && agent.id) {
            urlCache[agent.id] = url;
            changed = true;
          }
        } catch (error) {
          logger.warn('[AgentList] Failed to refresh visible avatar: %o', error);
        }
      }),
    );
  }

  const entry = { urlCache };
  if (changed) {
    try {
      await cacheSet(cacheKey, entry, ttl);
    } catch (error) {
      logger.warn('[AgentList] Failed to cache refreshed avatars: %o', error);
    }
  }
  return entry;
}
