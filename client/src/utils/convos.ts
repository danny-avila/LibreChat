import { QueryClient } from '@tanstack/react-query';
import { LocalStorageKeys, QueryKeys } from 'librechat-data-provider';
import {
  format,
  isToday,
  subDays,
  getYear,
  parseISO,
  startOfDay,
  startOfYear,
  isWithinInterval,
} from 'date-fns';
import type { TConversation, GroupedConversations } from 'librechat-data-provider';
import type { InfiniteData, QueryKey } from '@tanstack/react-query';
import { isTemporaryConversation } from './conversation';

/**
 * A conversation is unseen when a reply landed after the user last caught up with it.
 *
 * Both timestamps ride in the conversation list payload, so this stays a pure comparison and
 * costs no extra request. Conversations predating the feature have no `lastResponseAt` and are
 * therefore treated as seen, which is what keeps the sidebar quiet after deploy.
 */
export const isConversationUnseen = (
  conversation: Pick<TConversation, 'lastResponseAt' | 'lastSeenAt'> | undefined | null,
): boolean => {
  const lastResponseAt = conversation?.lastResponseAt;
  if (!lastResponseAt) {
    return false;
  }
  const lastSeenAt = conversation?.lastSeenAt;
  if (!lastSeenAt) {
    return true;
  }
  return new Date(lastSeenAt).getTime() < new Date(lastResponseAt).getTime();
};

// Date group helpers
export const dateKeys = {
  today: 'com_ui_date_today',
  yesterday: 'com_ui_date_yesterday',
  previous7Days: 'com_ui_date_previous_7_days',
  previous30Days: 'com_ui_date_previous_30_days',
  january: 'com_ui_date_january',
  february: 'com_ui_date_february',
  march: 'com_ui_date_march',
  april: 'com_ui_date_april',
  may: 'com_ui_date_may',
  june: 'com_ui_date_june',
  july: 'com_ui_date_july',
  august: 'com_ui_date_august',
  september: 'com_ui_date_september',
  october: 'com_ui_date_october',
  november: 'com_ui_date_november',
  december: 'com_ui_date_december',
};

const getGroupName = (date: Date) => {
  const now = new Date(Date.now());
  if (isToday(date)) {
    return dateKeys.today;
  }
  if (isWithinInterval(date, { start: startOfDay(subDays(now, 1)), end: now })) {
    return dateKeys.yesterday;
  }
  if (isWithinInterval(date, { start: subDays(now, 7), end: now })) {
    return dateKeys.previous7Days;
  }
  if (isWithinInterval(date, { start: subDays(now, 30), end: now })) {
    return dateKeys.previous30Days;
  }
  if (isWithinInterval(date, { start: startOfYear(now), end: now })) {
    const month = format(date, 'MMMM').toLowerCase();
    return dateKeys[month];
  }
  return ' ' + getYear(date).toString();
};

const monthOrderMap = new Map([
  ['december', 11],
  ['november', 10],
  ['october', 9],
  ['september', 8],
  ['august', 7],
  ['july', 6],
  ['june', 5],
  ['may', 4],
  ['april', 3],
  ['march', 2],
  ['february', 1],
  ['january', 0],
]);
const dateKeysReverse = Object.fromEntries(Object.entries(dateKeys).map(([k, v]) => [v, k]));
const dateGroupsSet = new Set([
  dateKeys.today,
  dateKeys.yesterday,
  dateKeys.previous7Days,
  dateKeys.previous30Days,
]);

export const groupConversationsByDate = (
  conversations: Array<TConversation | null>,
  dateField: 'updatedAt' | 'createdAt' = 'updatedAt',
): GroupedConversations => {
  if (!Array.isArray(conversations)) {
    return [];
  }
  const seenConversationIds = new Set();
  const groups = new Map();
  const now = new Date(Date.now());

  conversations.forEach((conversation) => {
    if (
      !conversation ||
      seenConversationIds.has(conversation.conversationId) ||
      conversation.pinned
    ) {
      return;
    }
    seenConversationIds.add(conversation.conversationId);

    let date: Date;
    const dateValue = conversation[dateField] ?? conversation.updatedAt ?? conversation.createdAt;
    if (dateValue) {
      date = parseISO(dateValue);
    } else {
      date = now;
    }
    const groupName = getGroupName(date);
    if (!groups.has(groupName)) {
      groups.set(groupName, []);
    }
    groups.get(groupName).push(conversation);
  });

  const sortedGroups = new Map();
  dateGroupsSet.forEach((group) => {
    if (groups.has(group)) {
      sortedGroups.set(group, groups.get(group));
    }
  });

  const yearMonthGroups = Array.from(groups.keys())
    .filter((group) => !dateGroupsSet.has(group))
    .sort((a, b) => {
      const [yearA, yearB] = [parseInt(a.trim()), parseInt(b.trim())];
      if (yearA !== yearB) {
        return yearB - yearA;
      }
      const [monthA, monthB] = [dateKeysReverse[a], dateKeysReverse[b]];
      const bOrder = monthOrderMap.get(monthB) ?? -1,
        aOrder = monthOrderMap.get(monthA) ?? -1;
      return bOrder - aOrder;
    });
  yearMonthGroups.forEach((group) => {
    sortedGroups.set(group, groups.get(group));
  });

  sortedGroups.forEach((conversations) => {
    conversations.sort(
      (a: TConversation, b: TConversation) =>
        new Date(b[dateField] ?? b.updatedAt ?? 0).getTime() -
        new Date(a[dateField] ?? a.updatedAt ?? 0).getTime(),
    );
  });
  return Array.from(sortedGroups, ([key, value]) => [key, value]);
};

export type ConversationCursorData = {
  conversations: TConversation[];
  nextCursor?: string | null;
};

function getConversationQueryProjectId(queryKey: readonly unknown[]): string | undefined {
  const params = queryKey[1];
  if (!params || typeof params !== 'object') {
    return undefined;
  }
  return (params as { projectId?: string }).projectId;
}

function conversationMatchesProjectQuery(
  queryKey: readonly unknown[],
  conversation: Pick<TConversation, 'chatProjectId'>,
): boolean {
  const projectId = getConversationQueryProjectId(queryKey);
  if (!projectId) {
    return true;
  }
  if (projectId === 'unassigned') {
    return !conversation.chatProjectId;
  }
  return conversation.chatProjectId === projectId;
}

function getConversationListQueryParams(queryKey: readonly unknown[]): {
  tags?: string[];
  search?: string;
} {
  const params = queryKey[1];
  if (!params || typeof params !== 'object') {
    return {};
  }
  return params as { tags?: string[]; search?: string };
}

/** Inserts must not land in a bookmark or search cache the row would not
 * appear in on the server. Search is not matchable client-side, so those
 * variants are skipped. */
function conversationMatchesListQuery(
  queryKey: readonly unknown[],
  conversation: Pick<TConversation, 'chatProjectId' | 'tags'>,
): boolean {
  if (!conversationMatchesProjectQuery(queryKey, conversation)) {
    return false;
  }
  const { tags, search } = getConversationListQueryParams(queryKey);
  if (typeof search === 'string' && search.trim() !== '') {
    return false;
  }
  if (Array.isArray(tags) && tags.length > 0) {
    const conversationTags = conversation.tags;
    if (!Array.isArray(conversationTags) || conversationTags.length === 0) {
      return false;
    }
    return tags.some((tag) => conversationTags.includes(tag));
  }
  return true;
}

/** Dedicated pinned data wins for ids it already has. Pins that only live on
 * the loaded chats pages are appended so a failed refetch of the dedicated
 * query cannot hide a newly pinned row. */
export function collectPinnedConversations(
  dedicated: Array<TConversation | null | undefined> | undefined,
  fromChats: Array<TConversation | null | undefined>,
): TConversation[] {
  const byId = new Map<string, TConversation>();
  for (const conversation of dedicated ?? []) {
    if (conversation?.conversationId && conversation.pinned === true) {
      byId.set(conversation.conversationId, conversation);
    }
  }
  for (const conversation of fromChats) {
    if (
      conversation?.conversationId &&
      conversation.pinned === true &&
      !byId.has(conversation.conversationId)
    ) {
      byId.set(conversation.conversationId, conversation);
    }
  }
  /** The server returns pins newest-first, so a row merged in from the chats cache
   * has to take its place in that order: a chat pinned while the dedicated refetch
   * is failing is the newest pin, and appending it would bury it below the fold. */
  return [...byId.values()].sort((a, b) => pinnedSortTime(b) - pinnedSortTime(a));
}

function pinnedSortTime(conversation: TConversation): number {
  const timestamp = Date.parse(conversation.updatedAt ?? conversation.createdAt ?? '');
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

/**
 * Reads the project id from the current URL's `?projectId` param — the source of
 * truth for a new chat's project scope (the conversation atom can lag behind it).
 */
export function getRouteChatProjectId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const projectId = new URLSearchParams(window.location.search).get('projectId');
  return projectId != null && /^[a-f\d]{24}$/i.test(projectId) ? projectId : null;
}

// === InfiniteData helpers for cursor-based convo queries ===

export function findConversationInInfinite(
  data: InfiniteData<ConversationCursorData> | undefined,
  conversationId: string,
): TConversation | undefined {
  if (!data) {
    return undefined;
  }
  for (const page of data.pages) {
    const found = page.conversations.find((c) => c.conversationId === conversationId);
    if (found) {
      return found;
    }
  }
  return undefined;
}

export function updateInfiniteConvoPage(
  data: InfiniteData<ConversationCursorData> | undefined,
  conversationId: string,
  updater: (c: TConversation) => TConversation,
): InfiniteData<ConversationCursorData> | undefined {
  if (!data) {
    return data;
  }
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      conversations: page.conversations.map((c) =>
        c.conversationId === conversationId ? updater(c) : c,
      ),
    })),
  };
}

export function addConversationToInfinitePages(
  data: InfiniteData<ConversationCursorData> | undefined,
  newConversation: TConversation,
): InfiniteData<ConversationCursorData> {
  if (!data) {
    return {
      pageParams: [undefined],
      pages: [{ conversations: [newConversation], nextCursor: null }],
    };
  }
  return {
    ...data,
    pages: [
      { ...data.pages[0], conversations: [newConversation, ...data.pages[0].conversations] },
      ...data.pages.slice(1),
    ],
  };
}

export function addConversationToAllConversationsQueries(
  queryClient: QueryClient,
  newConversation: TConversation,
) {
  // Find all keys that start with QueryKeys.allConversations
  const queries = queryClient
    .getQueryCache()
    .findAll([QueryKeys.allConversations], { exact: false });

  for (const query of queries) {
    if (!conversationMatchesProjectQuery(query.queryKey, newConversation)) {
      continue;
    }
    queryClient.setQueryData<InfiniteData<ConversationCursorData>>(query.queryKey, (old) => {
      if (
        !old ||
        old.pages[0].conversations.some((c) => c.conversationId === newConversation.conversationId)
      ) {
        return old;
      }
      return {
        ...old,
        pages: [
          {
            ...old.pages[0],
            conversations: [newConversation, ...old.pages[0].conversations],
          },
          ...old.pages.slice(1),
        ],
      };
    });
  }
}

export function removeConvoFromInfinitePages(
  data: InfiniteData<ConversationCursorData> | undefined,
  conversationId: string,
): InfiniteData<ConversationCursorData> | undefined {
  if (!data) {
    return data;
  }
  return {
    ...data,
    pages: data.pages
      .map((page) => ({
        ...page,
        conversations: page.conversations.filter((c) => c.conversationId !== conversationId),
      }))
      .filter((page) => page.conversations.length > 0),
  };
}

// Used for partial update (e.g., title, etc.), updating AND possibly bumping to front of visible convos
export function updateConvoFieldsInfinite(
  data: InfiniteData<ConversationCursorData> | undefined,
  updatedConversation: Partial<TConversation> & { conversationId: string },
  keepPosition = false,
): InfiniteData<ConversationCursorData> | undefined {
  if (!data) {
    return data;
  }
  let found: TConversation | undefined;
  let pageIdx = -1,
    convoIdx = -1;
  for (let i = 0; i < data.pages.length; ++i) {
    const idx = data.pages[i].conversations.findIndex(
      (c) => c.conversationId === updatedConversation.conversationId,
    );
    if (idx !== -1) {
      pageIdx = i;
      convoIdx = idx;
      found = data.pages[i].conversations[idx];
      break;
    }
  }
  if (!found) {
    return data;
  }

  if (keepPosition) {
    return {
      ...data,
      pages: data.pages.map((page, pi) =>
        pi === pageIdx
          ? {
              ...page,
              conversations: page.conversations.map((c, ci) =>
                ci === convoIdx ? { ...c, ...updatedConversation } : c,
              ),
            }
          : page,
      ),
    };
  } else {
    const patched = { ...found, ...updatedConversation, updatedAt: new Date().toISOString() };
    const pages = data.pages.map((page) => ({
      ...page,
      conversations: page.conversations.filter((c) => c.conversationId !== patched.conversationId),
    }));

    pages[0].conversations = [patched, ...pages[0].conversations];

    const finalPages = pages.filter((page) => page.conversations.length > 0);
    return { ...data, pages: finalPages };
  }
}

export function storeEndpointSettings(conversation: TConversation | null) {
  if (!conversation) {
    return;
  }
  const { endpoint, model } = conversation;
  if (!endpoint) {
    return;
  }
  const lastModel = JSON.parse(localStorage.getItem(LocalStorageKeys.LAST_MODEL) ?? '{}');
  lastModel[endpoint] = model;
  localStorage.setItem(LocalStorageKeys.LAST_MODEL, JSON.stringify(lastModel));
}

// Add
export function addConvoToAllQueries(queryClient: QueryClient, newConvo: TConversation) {
  const queries = queryClient
    .getQueryCache()
    .findAll([QueryKeys.allConversations], { exact: false });

  for (const query of queries) {
    if (!conversationMatchesListQuery(query.queryKey, newConvo)) {
      continue;
    }
    queryClient.setQueryData<InfiniteData<ConversationCursorData>>(query.queryKey, (oldData) => {
      if (!oldData) {
        return oldData;
      }
      if (
        oldData.pages.some((p) =>
          p.conversations.some((c) => c.conversationId === newConvo.conversationId),
        )
      ) {
        return oldData;
      }
      /** Removing the last loaded row leaves a cache with no pages at all, so the
       * first page has to be recreated rather than spread from `undefined`. */
      const firstPage = oldData.pages[0] ?? { conversations: [], nextCursor: null };
      return {
        ...oldData,
        pages: [
          {
            ...firstPage,
            conversations: [newConvo, ...firstPage.conversations],
          },
          ...oldData.pages.slice(1),
        ],
      };
    });
  }
}

export function upsertConvoInAllQueries(
  queryClient: QueryClient,
  nextConvo: TConversation,
  moveToTop = true,
) {
  if (!nextConvo.conversationId) {
    return;
  }
  const conversationId = nextConvo.conversationId;

  /* The history query excludes temporary conversations server-side, so seeding
     one into the list caches would surface it in the sidebar until the next
     refetch, contradicting what temporary mode promises. Enforced here rather
     than at each caller so a future insert path cannot reintroduce the leak. */
  if (isTemporaryConversation(nextConvo)) {
    return;
  }

  const cachedPin = findPinnedConversation(queryClient, conversationId);
  const listConvo = cachedPin ? preserveListFlags(nextConvo, cachedPin) : nextConvo;

  /* Root-level SSE updates and resumable settlement go through upsert, not
     update. Merge into any already-cached pin so that path cannot leave the
     section at the old title or position. Carry its list flags into history
     too when the conversation is older than the loaded pages. Do not insert
     into the pinned cache: a new chat is not pinned until the pin mutation
     refetches. */
  updatePinnedConvosQuery(
    queryClient,
    conversationId,
    (found) => ({
      ...found,
      ...listConvo,
      updatedAt: listConvo.updatedAt ?? (moveToTop ? new Date().toISOString() : found.updatedAt),
    }),
    moveToTop,
  );

  const queries = queryClient
    .getQueryCache()
    .findAll([QueryKeys.allConversations], { exact: false });

  for (const query of queries) {
    queryClient.setQueryData<InfiniteData<ConversationCursorData>>(query.queryKey, (oldData) => {
      if (!oldData) {
        return oldData;
      }

      let pageIdx = -1;
      let convoIdx = -1;
      for (let pi = 0; pi < oldData.pages.length; pi++) {
        const ci = oldData.pages[pi].conversations.findIndex(
          (c) => c.conversationId === conversationId,
        );
        if (ci !== -1) {
          pageIdx = pi;
          convoIdx = ci;
          break;
        }
      }

      const now = new Date().toISOString();
      if (pageIdx === -1) {
        if (!conversationMatchesListQuery(query.queryKey, listConvo)) {
          return oldData;
        }
        const firstPage = oldData.pages[0] ?? { conversations: [], nextCursor: null };
        return {
          ...oldData,
          pages: [
            {
              ...firstPage,
              conversations: [
                { ...listConvo, updatedAt: listConvo.updatedAt ?? now },
                ...firstPage.conversations,
              ],
            },
            ...oldData.pages.slice(1),
          ],
        };
      }

      const found = oldData.pages[pageIdx].conversations[convoIdx];
      const updated = {
        ...found,
        ...listConvo,
        updatedAt: listConvo.updatedAt ?? (moveToTop ? now : found.updatedAt),
      };

      if (!conversationMatchesProjectQuery(query.queryKey, updated)) {
        return removeConvoFromInfinitePages(oldData, updated.conversationId ?? '');
      }

      if (!moveToTop || (pageIdx === 0 && convoIdx === 0)) {
        return {
          ...oldData,
          pages: oldData.pages.map((page, pi) =>
            pi === pageIdx
              ? {
                  ...page,
                  conversations: page.conversations.map((c, ci) => (ci === convoIdx ? updated : c)),
                }
              : page,
          ),
        };
      }

      const pages = oldData.pages.map((page, pi) => {
        if (pi === 0 && pageIdx === 0) {
          const conversations = page.conversations.filter((_, ci) => ci !== convoIdx);
          return { ...page, conversations: [updated, ...conversations] };
        }
        if (pi === 0) {
          return { ...page, conversations: [updated, ...page.conversations] };
        }
        if (pi === pageIdx) {
          return {
            ...page,
            conversations: page.conversations.filter((_, ci) => ci !== convoIdx),
          };
        }
        return page;
      });

      return { ...oldData, pages };
    });
  }
}

export type PinnedConversationsData = {
  conversations: TConversation[];
  nextCursor?: string | null;
};

/** A cached copy of a conversation together with when its query last heard from the server. */
export type ConvoCandidate = { convo: TConversation; heardAt: number };

/**
 * Picks whichever cached copy of a conversation carries the newest read state.
 *
 * The same row is cached once per list variant (unfiltered, per project, per tag, pinned, plus
 * the point query for the open conversation), and only the mounted ones refetch. Taking the
 * first copy found would let an older variant shadow a newer reply, and the caller would read a
 * conversation as caught up while the visible row still shows its dot.
 *
 * The reply stamp decides, since that one only moves forward. The catch-up cannot break the tie:
 * "mark as unread" clears it outright, so a fresh `undefined` is newer than a stale stamp and
 * comparing the values would pick the stale copy. What separates them is which query last heard
 * from the server, which React Query already tracks.
 */
export const freshestCandidate = (
  a: ConvoCandidate | undefined,
  b: ConvoCandidate | undefined,
): ConvoCandidate | undefined => {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  const responseDelta = (b.convo.lastResponseAt ?? '').localeCompare(a.convo.lastResponseAt ?? '');
  if (responseDelta !== 0) {
    return responseDelta > 0 ? b : a;
  }
  return b.heardAt > a.heardAt ? b : a;
};

const candidateFrom = (
  queryClient: QueryClient,
  queryKey: QueryKey,
  convo: TConversation | undefined,
): ConvoCandidate | undefined =>
  convo ? { convo, heardAt: queryClient.getQueryState(queryKey)?.dataUpdatedAt ?? 0 } : undefined;

/** Reads a pin out of whichever cached bookmark variant holds it. Single-conversation
 * responses omit server-derived fields like `isShared`, so callers that insert one
 * elsewhere need the cached row to carry them over. */
export function findPinnedConversation(
  queryClient: QueryClient,
  conversationId: string,
): TConversation | undefined {
  return findPinnedCandidate(queryClient, conversationId)?.convo;
}

/** Keyed by the active bookmark filter, so a pin is cached once per variant and only the
 *  mounted ones refetch; reduced for the same reason the chats list is. */
function findPinnedCandidate(
  queryClient: QueryClient,
  conversationId: string,
): ConvoCandidate | undefined {
  const queries = queryClient
    .getQueryCache()
    .findAll([QueryKeys.pinnedConversations], { exact: false });

  let freshest: ConvoCandidate | undefined;
  for (const query of queries) {
    const data = queryClient.getQueryData<PinnedConversationsData>(query.queryKey);
    const found = data?.conversations.find((c) => c.conversationId === conversationId);
    freshest = freshestCandidate(freshest, candidateFrom(queryClient, query.queryKey, found));
  }
  return freshest;
}

/**
 * Flags the sidebar owns rather than the chat: `isShared` is derived per list request from
 * the shared-links collection, and `pinned` is set by the pin mutation alone. Neither is
 * carried by the single-conversation payloads callers swap in wholesale, so an omitted flag
 * means "unchanged" rather than "cleared".
 */
const listFlags = ['isShared', 'pinned'] as const;

function preserveListFlags(next: TConversation, found: TConversation): TConversation {
  const carried = listFlags.filter((flag) => next[flag] === undefined && found[flag] !== undefined);
  if (carried.length === 0) {
    return next;
  }
  const merged = { ...next };
  for (const flag of carried) {
    merged[flag] = found[flag];
  }
  return merged;
}

/**
 * A chat's conversation state snapshots the sidebar flags when the chat is opened and never
 * hears about a later change, so pinning an open chat leaves a stale `pinned: false` on it.
 * Strip them before that state reaches the list caches, or the next message would write the
 * stale value back over the sidebar and drop the chat out of Pinned.
 */
export function withoutListFlags(conversation: TConversation): TConversation {
  if (listFlags.every((flag) => conversation[flag] === undefined)) {
    return conversation;
  }
  const stripped = { ...conversation };
  for (const flag of listFlags) {
    delete stripped[flag];
  }
  return stripped;
}

/**
 * The pinned sidebar section is fed by its own request rather than by the paginated
 * chats list, so every edit that reaches the chats cache has to reach this one too or
 * the section keeps showing a stale title, or a chat that is no longer pinned.
 */
function updatePinnedConvosQuery(
  queryClient: QueryClient,
  conversationId: string,
  updater: (c: TConversation) => TConversation | null,
  moveToTop = false,
) {
  /* Keyed by the active bookmark filter, so every cached variant has to be touched
     rather than only the unfiltered one. */
  const queries = queryClient
    .getQueryCache()
    .findAll([QueryKeys.pinnedConversations], { exact: false });

  for (const query of queries) {
    queryClient.setQueryData<PinnedConversationsData>(query.queryKey, (oldData) => {
      if (!oldData) {
        return oldData;
      }
      const index = oldData.conversations.findIndex((c) => c.conversationId === conversationId);
      if (index === -1) {
        return oldData;
      }
      const found = oldData.conversations[index];
      const updated = updater(found);
      const merged = updated && preserveListFlags(updated, found);
      if (!merged || merged.pinned !== true) {
        return {
          ...oldData,
          conversations: oldData.conversations.filter((_, i) => i !== index),
        };
      }

      /* The server returns pins newest-first, so a pin that just received a message has
         to lead the section the same way it leads the chats list. The SSE payload can
         still carry the previous turn's `updatedAt`, so refresh it exactly as the chats
         cache does: anything that sorts this list afterwards would otherwise read the
         stale value and undo the move. */
      if (moveToTop) {
        const rest = oldData.conversations.filter((_, i) => i !== index);
        const updatedAt =
          merged.updatedAt !== found.updatedAt ? merged.updatedAt : new Date().toISOString();
        return {
          ...oldData,
          conversations: [{ ...merged, updatedAt }, ...rest],
        };
      }

      return {
        ...oldData,
        conversations: oldData.conversations.map((c, i) => (i === index ? merged : c)),
      };
    });
  }
}

// Update
/**
 * Whether any cache the unseen aggregate reads holds this conversation.
 *
 * The point query is deliberately excluded: it holds the conversation the user opened by URL,
 * which `useUnseenConversations` neither scans nor subscribes to, so a row present only there
 * still needs the chats list refetched before it can reach the badge or the alerts.
 */
export function isConvoInAggregateCaches(
  queryClient: QueryClient,
  conversationId: string,
): boolean {
  const queries = queryClient
    .getQueryCache()
    .findAll([QueryKeys.allConversations], { exact: false });

  for (const query of queries) {
    const data = queryClient.getQueryData<InfiniteData<ConversationCursorData>>(query.queryKey);
    if (findConversationInInfinite(data, conversationId)) {
      return true;
    }
  }
  return findPinnedConversation(queryClient, conversationId) !== undefined;
}

/**
 * Reads a conversation out of the cached queries that hold it.
 *
 * Callers that only need a point-in-time answer use this instead of subscribing to the list,
 * which keeps event-driven checks off the render path.
 *
 * The pinned section is fed by its own request, so a pin older than the loaded chat pages lives
 * only there. Missing it would leave such a row's unseen dot stuck: the caller would read the
 * conversation as absent, and absent reads as caught up.
 */
export function findConvoInAllQueries(
  queryClient: QueryClient,
  conversationId: string,
): TConversation | undefined {
  const queries = queryClient
    .getQueryCache()
    .findAll([QueryKeys.allConversations], { exact: false });

  let freshest: ConvoCandidate | undefined;
  for (const query of queries) {
    const data = queryClient.getQueryData<InfiniteData<ConversationCursorData>>(query.queryKey);
    freshest = freshestCandidate(
      freshest,
      candidateFrom(queryClient, query.queryKey, findConversationInInfinite(data, conversationId)),
    );
  }
  freshest = freshestCandidate(freshest, findPinnedCandidate(queryClient, conversationId));

  /* The conversation opened by URL is loaded into its own point query, and an old one need not
     appear in any loaded list page at all. Without this it would read as absent, absent reads
     as caught up, and the reply the user is looking at would never be acknowledged. */
  const pointKey = [QueryKeys.conversation, conversationId];
  return freshestCandidate(
    freshest,
    candidateFrom(queryClient, pointKey, queryClient.getQueryData<TConversation>(pointKey)),
  )?.convo;
}

export function updateConvoInAllQueries(
  queryClient: QueryClient,
  conversationId: string,
  updater: (c: TConversation) => TConversation,
  moveToTop = false,
) {
  /* Reads resolve the point query, so writes have to reach it too, or a conversation that lives
     only there would keep whatever it was loaded with. The updater is applied to that copy
     rather than a list row being written over it: the point cache carries fields the list rows
     do not, `messages` among them. */
  queryClient.setQueryData<TConversation>([QueryKeys.conversation, conversationId], (current) =>
    current ? updater(current) : current,
  );
  updatePinnedConvosQuery(queryClient, conversationId, updater, moveToTop);

  const queries = queryClient
    .getQueryCache()
    .findAll([QueryKeys.allConversations], { exact: false });

  for (const query of queries) {
    queryClient.setQueryData<InfiniteData<ConversationCursorData>>(query.queryKey, (oldData) => {
      if (!oldData) {
        return oldData;
      }

      // Find conversation location (single pass with early exit)
      let pageIdx = -1;
      let convoIdx = -1;
      for (let pi = 0; pi < oldData.pages.length; pi++) {
        const ci = oldData.pages[pi].conversations.findIndex(
          (c) => c.conversationId === conversationId,
        );
        if (ci !== -1) {
          pageIdx = pi;
          convoIdx = ci;
          break;
        }
      }

      if (pageIdx === -1) {
        return oldData;
      }

      const found = oldData.pages[pageIdx].conversations[convoIdx];
      /** Callers that swap in a server response or the chat's own state wholesale (rename,
       * pin, SSE updates) omit the sidebar-only flags, which would otherwise drop the
       * shared badge and push a pinned chat back into the date groups. The unseen-reply
       * timestamps are absent from those payloads too, but they are carried on key presence
       * rather than on value: a present-but-undefined stamp is an explicit clear
       * (mark-unread, optimistic rollback). */
      const next = updater(found);
      const merged: TConversation = { ...preserveListFlags(next, found) };
      if (!('lastResponseAt' in next)) {
        merged.lastResponseAt = found.lastResponseAt;
      }
      if (!('lastSeenAt' in next)) {
        merged.lastSeenAt = found.lastSeenAt;
      }
      /* `moveToTop` normally refreshes the date itself, because callers that swap in an SSE
         payload can carry the previous turn's `updatedAt`. A caller that deliberately changed
         it is naming the server's own value, which is the more accurate one to keep. */
      const updated = moveToTop
        ? {
            ...merged,
            updatedAt:
              merged.updatedAt !== found.updatedAt ? merged.updatedAt : new Date().toISOString(),
          }
        : merged;

      if (!conversationMatchesProjectQuery(query.queryKey, updated)) {
        return removeConvoFromInfinitePages(oldData, conversationId);
      }

      // If not moving to top, or already at top of page 0, update in place
      if (!moveToTop || (pageIdx === 0 && convoIdx === 0)) {
        return {
          ...oldData,
          pages: oldData.pages.map((page, pi) =>
            pi === pageIdx
              ? {
                  ...page,
                  conversations: page.conversations.map((c, ci) => (ci === convoIdx ? updated : c)),
                }
              : page,
          ),
        };
      }

      // Move to top: only modify affected pages
      const newPages = oldData.pages.map((page, pi) => {
        if (pi === 0 && pageIdx === 0) {
          // Source is page 0: remove from current position, add to front
          const convos = page.conversations.filter((_, ci) => ci !== convoIdx);
          return { ...page, conversations: [updated, ...convos] };
        }
        if (pi === 0) {
          // Add to front of page 0
          return { ...page, conversations: [updated, ...page.conversations] };
        }
        if (pi === pageIdx) {
          // Remove from source page
          return {
            ...page,
            conversations: page.conversations.filter((_, ci) => ci !== convoIdx),
          };
        }
        return page;
      });

      return { ...oldData, pages: newPages };
    });
  }
}

// Remove
export function removeConvoFromAllQueries(queryClient: QueryClient, conversationId: string) {
  updatePinnedConvosQuery(queryClient, conversationId, () => null);

  const queries = queryClient
    .getQueryCache()
    .findAll([QueryKeys.allConversations], { exact: false });

  for (const query of queries) {
    queryClient.setQueryData<InfiniteData<ConversationCursorData>>(query.queryKey, (oldData) => {
      if (!oldData) {
        return oldData;
      }
      return {
        ...oldData,
        pages: oldData.pages
          .map((page) => ({
            ...page,
            conversations: page.conversations.filter((c) => c.conversationId !== conversationId),
          }))
          .filter((page) => page.conversations.length > 0),
      };
    });
  }
}
