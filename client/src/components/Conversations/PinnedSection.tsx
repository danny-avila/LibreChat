import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useDrag, useDragLayer, useDrop } from 'react-dnd';
import { Skeleton, useMediaQuery, useToastContext } from '@librechat/client';
import type { TConversation, TEndpointsConfig } from 'librechat-data-provider';
import type {
  SelectEndpointHandler,
  SelectSpecHandler,
} from '~/components/Nav/Favorites/useFavoritesData';
import type { ConversationDragItem } from './dnd';
import type { Favorite } from '~/store/favorites';
import {
  useActiveJobs,
  useGetPinnedOrderQuery,
  usePinConversationMutation,
  useUpdatePinnedOrderMutation,
} from '~/data-provider';
import useFavoritesData from '~/components/Nav/Favorites/useFavoritesData';
import FavoriteItem from '~/components/Nav/Favorites/FavoriteItem';
import { useLocalize, useLocalStorage } from '~/hooks';
import { getSpecAgentAvatarURL, cn } from '~/utils';
import { NotificationSeverity } from '~/common';
import { CONVERSATION_DRAG_TYPE } from './dnd';
import { Collapse } from '~/components/ui';
import Convo from './Convo';

const FAVORITE_ROW_DRAG_TYPE = 'favorite-item';
/** A pinned row accepts both: favorites reorder here only, while a dragged
 *  conversation reorders here but can also be dropped on a project row or the
 *  Chats section to be filed or unfiled. */
const PINNED_ROW_ACCEPTS = [CONVERSATION_DRAG_TYPE, FAVORITE_ROW_DRAG_TYPE];

const noop = () => {};

export const favoriteEntryKey = (favorite: Favorite): string => {
  if (favorite.agentId) {
    return `agent:${favorite.agentId}`;
  }
  if (favorite.spec) {
    return `spec:${favorite.spec}`;
  }
  return `model:${favorite.endpoint}::${favorite.model}`;
};

const convoEntryKey = (conversationId: string): string => `convo:${conversationId}`;

type PinnedEntry =
  | { key: string; kind: 'favorite'; favorite: Favorite }
  | { key: string; kind: 'convo'; conversationId: string };

type PinnedRowDragItem = ConversationDragItem & { key: string };

/** Mirrors a favorite row (h-9, icon, title) so the loading swap keeps height. */
const FavoriteRowSkeleton = () => (
  <div className="flex w-full items-center rounded-lg p-2" aria-hidden="true">
    <Skeleton className="mr-2 h-5 w-5 rounded-full" />
    <Skeleton className="h-4 w-24" />
  </div>
);

interface DraggablePinnedRowProps {
  entry: PinnedEntry;
  conversation?: TConversation;
  moveEntry: (dragKey: string, hoverKey: string) => void;
  onDrop: () => void;
  children: React.ReactNode;
}

/** Hover-reorder wrapper for the unified pinned list, following the favorites
 *  pattern: rows shift as the drag passes them and the order commits on drop.
 *  Touch pointers are excluded, matching every other drag source here. */
const DraggablePinnedRow = ({
  entry,
  conversation,
  moveEntry,
  onDrop,
  children,
}: DraggablePinnedRowProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const canDrag = useMediaQuery('(hover: hover)');
  const [{ handlerId }, drop] = useDrop<PinnedRowDragItem, unknown, { handlerId: unknown }>({
    accept: PINNED_ROW_ACCEPTS,
    collect(monitor) {
      return { handlerId: monitor.getHandlerId() };
    },
    hover(item) {
      if (item.key === entry.key || !item.key) {
        return;
      }
      moveEntry(item.key, entry.key);
    },
  });

  const [{ isDragging }, drag] = useDrag<PinnedRowDragItem, unknown, { isDragging: boolean }>({
    type: entry.kind === 'convo' ? CONVERSATION_DRAG_TYPE : FAVORITE_ROW_DRAG_TYPE,
    item: (): PinnedRowDragItem =>
      entry.kind === 'convo'
        ? {
            key: entry.key,
            conversationId: entry.conversationId,
            chatProjectId: conversation?.chatProjectId ?? null,
            pinned: conversation?.pinned === true,
          }
        : { key: entry.key, conversationId: '', chatProjectId: null, pinned: false },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    end: () => {
      onDrop();
    },
  });

  drop(ref);
  drag(canDrag ? ref : null);

  return (
    <div ref={ref} style={{ opacity: isDragging ? 0 : 1 }} data-handler-id={handlerId}>
      {children}
    </div>
  );
};

interface FavoriteRowProps {
  favorite: Favorite;
  agentsMap: ReturnType<typeof useFavoritesData>['agentsMap'];
  specsMap: ReturnType<typeof useFavoritesData>['specsMap'];
  endpointsConfig: TEndpointsConfig;
  isAgentsLoading: boolean;
  onSelectEndpoint: SelectEndpointHandler;
  onSelectSpec: SelectSpecHandler;
}

/** One favorite rendered for the unified list; skeleton while its agent is
 *  still resolving, nothing if the agent or spec is gone (cleanup handles the
 *  latter asynchronously). */
const FavoriteRow = ({
  favorite,
  agentsMap,
  specsMap,
  endpointsConfig,
  isAgentsLoading,
  onSelectEndpoint,
  onSelectSpec,
}: FavoriteRowProps) => {
  if (favorite.agentId) {
    const agent = agentsMap[favorite.agentId];
    if (!agent) {
      if (isAgentsLoading) {
        return <FavoriteRowSkeleton />;
      }
      return null;
    }
    return <FavoriteItem item={agent} type="agent" onSelectEndpoint={onSelectEndpoint} />;
  }
  if (favorite.spec) {
    const spec = specsMap[favorite.spec];
    if (!spec) {
      return null;
    }
    return (
      <FavoriteItem
        item={spec}
        type="spec"
        onSelectSpec={onSelectSpec}
        endpointsConfig={endpointsConfig}
        agentAvatarURL={getSpecAgentAvatarURL(spec, agentsMap)}
      />
    );
  }
  if (favorite.model && favorite.endpoint) {
    return (
      <FavoriteItem
        item={{ model: favorite.model, endpoint: favorite.endpoint }}
        type="model"
        onSelectEndpoint={onSelectEndpoint}
      />
    );
  }
  return null;
};

interface PinnedSectionProps {
  conversations: TConversation[];
  toggleNav: () => void;
  isSmallScreen?: boolean;
}

/** Pinned chats and pinned agents/models/specs (favorites) render as ONE
 *  reorderable list: favorites and conversations interleave freely, the order
 *  persists per user, and the section opens with the same collapse motion as
 *  the Projects section above it. */
const PinnedSection = ({ conversations, toggleNav, isSmallScreen }: PinnedSectionProps) => {
  const localize = useLocalize();
  const [isExpanded, setIsExpanded] = useLocalStorage('pinnedSectionExpanded', true);
  const { data: activeJobsData } = useActiveJobs();
  const favoritesData = useFavoritesData();
  const { data: storedOrder } = useGetPinnedOrderQuery();
  const updatePinnedOrder = useUpdatePinnedOrderMutation();
  const pinMutation = usePinConversationMutation();
  const { showToast } = useToastContext();
  const activeJobIds = useMemo(
    () => new Set(activeJobsData?.activeJobIds ?? []),
    [activeJobsData?.activeJobIds],
  );

  /* Dropping an unpinned conversation anywhere on the section pins it. Row
   * drops reorder instead (their targets carry no drop handler, so a drop that
   * misses them bubbles here), and already-pinned rows are refused so an
   * aborted reorder never re-pins anything. */
  const [{ isPinOver, canPin }, pinDropRef] = useDrop<
    ConversationDragItem,
    unknown,
    { isPinOver: boolean; canPin: boolean }
  >({
    accept: CONVERSATION_DRAG_TYPE,
    canDrop: (item) => item.pinned !== true,
    drop: (item) => {
      if (!item.conversationId) {
        return;
      }
      pinMutation.mutate(
        { conversationId: item.conversationId, pinned: true },
        {
          onError: () => {
            showToast({
              message: localize('com_ui_pin_error'),
              severity: NotificationSeverity.ERROR,
              showIcon: true,
            });
          },
        },
      );
    },
    collect: (monitor) => ({ isPinOver: monitor.isOver(), canPin: monitor.canDrop() }),
  });

  /* An empty section still needs to receive the drop, so it materializes as a
   * drop zone while a conversation is being dragged. */
  const draggingConversation = useDragLayer(
    (monitor) => monitor.isDragging() && monitor.getItemType() === CONVERSATION_DRAG_TYPE,
  );

  /** Natural order: favorites in their stored order, then pinned chats. */
  const naturalEntries = useMemo<PinnedEntry[]>(
    () => [
      ...favoritesData.favorites.map((favorite) => ({
        key: favoriteEntryKey(favorite),
        kind: 'favorite' as const,
        favorite,
      })),
      ...conversations
        .filter((convo) => convo.conversationId)
        .map((convo) => ({
          key: convoEntryKey(convo.conversationId as string),
          kind: 'convo' as const,
          conversationId: convo.conversationId as string,
        })),
    ],
    [favoritesData.favorites, conversations],
  );

  /** Stored keys order the entries they still resolve to; the rest append in
   *  natural order, so a stale order never hides an item. */
  const orderedEntries = useMemo<PinnedEntry[]>(() => {
    if (!storedOrder || storedOrder.length === 0) {
      return naturalEntries;
    }
    const byKey = new Map(naturalEntries.map((entry) => [entry.key, entry]));
    const ordered: PinnedEntry[] = [];
    const placed = new Set<string>();
    for (const key of storedOrder) {
      const entry = byKey.get(key);
      if (entry) {
        ordered.push(entry);
        placed.add(key);
      }
    }
    for (const entry of naturalEntries) {
      if (!placed.has(entry.key)) {
        ordered.push(entry);
      }
    }
    return ordered;
  }, [storedOrder, naturalEntries]);

  /* The live list the drag mutates; keyed ordering only, so a refetch under a
   * drag cannot clobber the in-flight arrangement. */
  const dragEntriesRef = useRef<PinnedEntry[]>(orderedEntries);
  const [liveEntries, setLiveEntries] = useState<PinnedEntry[] | null>(null);

  if (orderedEntries !== dragEntriesRef.current && liveEntries === null) {
    dragEntriesRef.current = orderedEntries;
  }

  const displayEntries = liveEntries ?? orderedEntries;

  const moveEntry = useCallback((dragKey: string, hoverKey: string) => {
    const list = [...dragEntriesRef.current];
    const from = list.findIndex((entry) => entry.key === dragKey);
    const to = list.findIndex((entry) => entry.key === hoverKey);
    if (from < 0 || to < 0 || from === to) {
      return;
    }
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    dragEntriesRef.current = list;
    setLiveEntries(list);
  }, []);

  const commitOrder = useCallback(() => {
    const entries = dragEntriesRef.current;
    setLiveEntries(null);
    updatePinnedOrder.mutate(entries.map((entry) => entry.key));
    /* Keep the favorites array itself matching its new relative order, so any
     * other consumer of favorites agrees with what the section shows. */
    const orderedFavorites = entries
      .filter((entry) => entry.kind === 'favorite')
      .map((entry) => (entry as { favorite: Favorite }).favorite);
    const current = favoritesData.favorites;
    const changed =
      orderedFavorites.length !== current.length ||
      orderedFavorites.some((favorite, index) => favorite !== current[index]);
    if (changed) {
      favoritesData.reorderFavorites(orderedFavorites, true);
    }
  }, [updatePinnedOrder, favoritesData]);

  const handleSelectEndpoint = useCallback<SelectEndpointHandler>(
    (...args) => {
      favoritesData.onSelectEndpoint?.(...args);
      if (isSmallScreen) {
        toggleNav();
      }
    },
    [favoritesData, isSmallScreen, toggleNav],
  );

  const handleSelectSpec = useCallback<SelectSpecHandler>(
    (...args) => {
      favoritesData.onSelectSpec?.(...args);
      if (isSmallScreen) {
        toggleNav();
      }
    },
    [favoritesData, isSmallScreen, toggleNav],
  );

  /* The section renders while either half is present or still resolving, and
   * drops out only once both are definitively empty. A live conversation drag
   * keeps it mounted as a drop target even when empty. */
  if (naturalEntries.length === 0 && !favoritesData.isLoading && !draggingConversation) {
    return null;
  }

  const conversationByKey = new Map(
    conversations.map((convo) => [convo.conversationId ?? '', convo]),
  );

  return (
    <div
      ref={pinDropRef}
      className="flex flex-col px-3 text-sm"
      role="region"
      aria-label={localize('com_ui_pinned')}
    >
      <div
        className={cn(
          'flex h-8 w-full items-center pr-2',
          isPinOver && canPin && 'rounded-lg bg-surface-active-alt',
        )}
      >
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="group flex min-w-0 flex-1 items-center gap-1 rounded-lg px-1 py-2 text-xs font-bold text-text-secondary outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-primary"
          type="button"
          aria-expanded={isExpanded}
        >
          <span className="select-none truncate">{localize('com_ui_pinned')}</span>
          <ChevronDown
            className={cn(
              'h-3 w-3 shrink-0 transition-transform duration-200',
              isExpanded ? '' : '-rotate-90',
            )}
            aria-hidden="true"
          />
        </button>
      </div>

      <Collapse open={isExpanded}>
        <div className="scrollbar-gutter-stable max-h-[42vh] overflow-y-auto pt-0.5">
          {displayEntries.length === 0 && draggingConversation && (
            <div
              className={cn(
                'flex h-9 items-center justify-center rounded-lg border border-dashed text-xs text-text-secondary',
                isPinOver && canPin
                  ? 'border-border-medium bg-surface-active-alt text-text-primary'
                  : 'border-border-light',
              )}
              aria-hidden="true"
            >
              {localize('com_ui_drop_to_pin')}
            </div>
          )}
          <ul className="m-0 list-none p-0">
            {favoritesData.isLoading && favoritesData.favorites.length === 0 && (
              <li className="list-none">
                <FavoriteRowSkeleton />
              </li>
            )}
            {displayEntries.map((entry) => {
              if (entry.kind === 'convo') {
                const convo = conversationByKey.get(entry.conversationId);
                if (!convo) {
                  return null;
                }
                return (
                  <li key={entry.key} className="list-none">
                    <DraggablePinnedRow
                      entry={entry}
                      conversation={convo}
                      moveEntry={moveEntry}
                      onDrop={commitOrder}
                    >
                      <Convo
                        conversation={convo}
                        retainView={noop}
                        toggleNav={toggleNav}
                        isGenerating={activeJobIds.has(convo.conversationId ?? '')}
                      />
                    </DraggablePinnedRow>
                  </li>
                );
              }
              return (
                <li key={entry.key} className="list-none">
                  <DraggablePinnedRow entry={entry} moveEntry={moveEntry} onDrop={commitOrder}>
                    <FavoriteRow
                      favorite={entry.favorite}
                      agentsMap={favoritesData.agentsMap}
                      specsMap={favoritesData.specsMap}
                      endpointsConfig={favoritesData.endpointsConfig}
                      isAgentsLoading={favoritesData.isAgentsLoading}
                      onSelectEndpoint={handleSelectEndpoint}
                      onSelectSpec={handleSelectSpec}
                    />
                  </DraggablePinnedRow>
                </li>
              );
            })}
          </ul>
        </div>
      </Collapse>
    </div>
  );
};

PinnedSection.displayName = 'PinnedSection';

export default memo(PinnedSection);
