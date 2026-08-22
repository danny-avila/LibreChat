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
import { CONVERSATION_DRAG_TYPE, mergeVisibleOrder, shouldSwapOnHover } from './dnd';
import useFavoritesData from '~/components/Nav/Favorites/useFavoritesData';
import FavoriteItem from '~/components/Nav/Favorites/FavoriteItem';
import { useLocalize, useLocalStorage } from '~/hooks';
import { getSpecAgentAvatarURL, cn } from '~/utils';
import { NotificationSeverity } from '~/common';
import { Collapse } from '~/components/ui';
import { focusFirstRow } from './focus';
import Convo from './Convo';

const FAVORITE_ROW_DRAG_TYPE = 'favorite-item';
/** A pinned row accepts both: favorites reorder here only, while a dragged
 *  conversation reorders here but can also be dropped on a project row or the
 *  Chats section to be filed or unfiled. */
const PINNED_ROW_ACCEPTS = [CONVERSATION_DRAG_TYPE, FAVORITE_ROW_DRAG_TYPE];

const noop = () => {};

/** A key identifies a row everywhere in this section, so the encoding has to be
 *  injective. The favorites API accepts any string for an endpoint or a model,
 *  so a plain `endpoint::model` join collides: `a::b` + `c` and `a` + `b::c`
 *  both read back as `a::b::c`, and the dedupe below would then hide one of two
 *  distinct favorites. Length-prefixing the endpoint makes the split exact. */
export const favoriteEntryKey = (favorite: Favorite): string => {
  if (favorite.agentId) {
    return `agent:${favorite.agentId}`;
  }
  if (favorite.spec) {
    return `spec:${favorite.spec}`;
  }
  const endpoint = favorite.endpoint ?? '';
  return `model:${endpoint.length}:${endpoint}:${favorite.model ?? ''}`;
};

const convoEntryKey = (conversationId: string): string => `convo:${conversationId}`;

const sameKeyOrder = (a: PinnedEntry[], b: PinnedEntry[]): boolean =>
  a.length === b.length && a.every((entry, index) => entry.key === b[index].key);

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
  indexOfKey: (key: string) => number;
  moveEntry: (dragKey: string, hoverKey: string) => void;
  moveEntryBy: (key: string, delta: number) => void;
  onDrop: () => void;
  /** Released while the row's title is being edited, so a drag-select inside
   *  the rename input is not swallowed by the drag source. */
  canDrag?: boolean;
  children: React.ReactNode;
}

/** Hover-reorder wrapper for the unified pinned list, following the favorites
 *  pattern: rows shift as the drag passes them and the order commits on drop.
 *  Touch pointers are excluded, matching every other drag source here, so the
 *  Alt+Arrow shortcut below is the only way to reorder without a mouse. */
const DraggablePinnedRow = ({
  entry,
  conversation,
  indexOfKey,
  moveEntry,
  moveEntryBy,
  onDrop,
  canDrag = true,
  children,
}: DraggablePinnedRowProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const hasHoverPointer = useMediaQuery('(hover: hover)');
  const [{ handlerId }, drop] = useDrop<PinnedRowDragItem, unknown, { handlerId: unknown }>({
    accept: PINNED_ROW_ACCEPTS,
    collect(monitor) {
      return { handlerId: monitor.getHandlerId() };
    },
    hover(item, monitor) {
      if (!item.key || item.key === entry.key || !ref.current) {
        return;
      }
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) {
        return;
      }
      const rect = ref.current.getBoundingClientRect();
      const swap = shouldSwapOnHover({
        dragIndex: indexOfKey(item.key),
        hoverIndex: indexOfKey(entry.key),
        pointerY: clientOffset.y,
        hoverTop: rect.top,
        hoverBottom: rect.bottom,
      });
      if (!swap) {
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
  drag(hasHoverPointer && canDrag ? ref : null);

  /* Keyboard equivalent of the drag: the shortcut is caught as it bubbles from
   * whichever element inside the row holds focus, so the row keeps that focus
   * across the move. */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    moveEntryBy(entry.key, event.key === 'ArrowUp' ? -1 : 1);
  };

  return (
    <div
      ref={ref}
      style={{ opacity: isDragging ? 0 : 1 }}
      data-handler-id={handlerId}
      onKeyDown={handleKeyDown}
    >
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
  onRemoveFocus: () => void;
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
  onRemoveFocus,
}: FavoriteRowProps) => {
  if (favorite.agentId) {
    const agent = agentsMap[favorite.agentId];
    if (!agent) {
      if (isAgentsLoading) {
        return <FavoriteRowSkeleton />;
      }
      return null;
    }
    return (
      <FavoriteItem
        item={agent}
        type="agent"
        onSelectEndpoint={onSelectEndpoint}
        onRemoveFocus={onRemoveFocus}
      />
    );
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
        onRemoveFocus={onRemoveFocus}
      />
    );
  }
  if (favorite.model && favorite.endpoint) {
    return (
      <FavoriteItem
        item={{ model: favorite.model, endpoint: favorite.endpoint }}
        type="model"
        onSelectEndpoint={onSelectEndpoint}
        onRemoveFocus={onRemoveFocus}
      />
    );
  }
  return null;
};

interface PinnedSectionProps {
  conversations: TConversation[];
  toggleNav: () => void;
  isSmallScreen?: boolean;
  /** A bookmark filter hides part of the pinned list. The order then has to be
   *  merged into the stored one rather than replacing it, or the hidden keys
   *  are dropped; without a filter, replacing also prunes keys whose item is
   *  gone. */
  isFiltered?: boolean;
}

/** Pinned chats and pinned agents/models/specs (favorites) render as ONE
 *  reorderable list: favorites and conversations interleave freely, the order
 *  persists per user, and the section opens with the same collapse motion as
 *  the Projects section above it. */
const PinnedSection = ({
  conversations,
  toggleNav,
  isSmallScreen,
  isFiltered = false,
}: PinnedSectionProps) => {
  const localize = useLocalize();
  const [isExpanded, setIsExpanded] = useLocalStorage('pinnedSectionExpanded', true);
  const { data: activeJobsData } = useActiveJobs();
  const favoritesData = useFavoritesData();
  const { data: storedOrder } = useGetPinnedOrderQuery();
  const updatePinnedOrder = useUpdatePinnedOrderMutation();
  const pinMutation = usePinConversationMutation();
  const { showToast } = useToastContext();
  const sectionRef = useRef<HTMLDivElement | null>(null);
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

  /** Natural order: favorites in their stored order, then pinned chats. Keys
   *  identify a row everywhere here, so a repeat has to be dropped rather than
   *  rendered: the `/favorites` payload validator accepts a duplicate entry,
   *  and one would give two rows the same React key, point every drag at the
   *  first copy, and make the order endpoint reject the write outright. */
  const naturalEntries = useMemo<PinnedEntry[]>(() => {
    const entries: PinnedEntry[] = [];
    const seen = new Set<string>();
    for (const favorite of favoritesData.favorites) {
      const key = favoriteEntryKey(favorite);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      entries.push({ key, kind: 'favorite', favorite });
    }
    for (const convo of conversations) {
      const conversationId = convo.conversationId;
      if (!conversationId) {
        continue;
      }
      const key = convoEntryKey(conversationId);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      entries.push({ key, kind: 'convo', conversationId });
    }
    return entries;
  }, [favoritesData.favorites, conversations]);

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
  const [announcement, setAnnouncement] = useState('');
  /** Only one row renames at a time, so its key is enough to release that row's
   *  drag source. */
  const [renamingKey, setRenamingKey] = useState<string | null>(null);

  if (orderedEntries !== dragEntriesRef.current && liveEntries === null) {
    dragEntriesRef.current = orderedEntries;
  }

  /* Hold the local arrangement until the stored order agrees with it. Dropping
   * it at commit time instead would snap the list back to the pre-move order
   * for as long as the write takes, and a second keyboard move in that window
   * would start from the order the user had already left behind. */
  if (liveEntries !== null && sameKeyOrder(liveEntries, orderedEntries)) {
    setLiveEntries(null);
  }

  const displayEntries = liveEntries ?? orderedEntries;

  /** Live index of a key in the list the drag is mutating, so a hover can tell
   *  which side of the hovered row the drag is coming from. */
  const indexOfKey = useCallback(
    (key: string) => dragEntriesRef.current.findIndex((entry) => entry.key === key),
    [],
  );

  /* Every drag end runs the commit, including drags that only filed a chat
   * into a project and drags that were abandoned without passing a row. Only a
   * drag that actually reordered something is worth a write. */
  const hasReorderedRef = useRef(false);

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
    hasReorderedRef.current = true;
    setLiveEntries(list);
  }, []);

  /** Keyboard reorder: one step per keypress, persisted immediately, with the
   *  new position announced because nothing visual conveys it to a screen
   *  reader. */
  const moveEntryBy = useCallback(
    (key: string, delta: number) => {
      const list = [...dragEntriesRef.current];
      const from = list.findIndex((entry) => entry.key === key);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= list.length) {
        return;
      }
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      dragEntriesRef.current = list;
      hasReorderedRef.current = true;
      setLiveEntries(list);
      setAnnouncement(
        localize('com_ui_moved_to_position', { 0: `${to + 1}`, 1: `${list.length}` }),
      );
      commitOrderRef.current();
    },
    [localize],
  );

  const commitOrder = useCallback(() => {
    if (!hasReorderedRef.current) {
      return;
    }
    hasReorderedRef.current = false;
    const entries = dragEntriesRef.current;
    const visibleKeys = entries.map((entry) => entry.key);
    const nextOrder = isFiltered ? mergeVisibleOrder(storedOrder ?? [], visibleKeys) : visibleKeys;
    /* The favorites array carries its own copy of the relative order, so other
     * consumers agree with what the section shows. It is written only once the
     * order itself is stored: persisting it on a failed write would leave the
     * two out of sync with each other and with the rolled-back display. */
    const orderedFavorites = entries
      .filter((entry) => entry.kind === 'favorite')
      .map((entry) => (entry as { favorite: Favorite }).favorite);
    const current = favoritesData.favorites;
    const favoritesMoved =
      orderedFavorites.length !== current.length ||
      orderedFavorites.some((favorite, index) => favorite !== current[index]);

    updatePinnedOrder.mutate(nextOrder, {
      onSuccess: () => {
        if (favoritesMoved) {
          favoritesData.reorderFavorites(orderedFavorites, true);
        }
      },
      /* The rejected order rolls back, so the local arrangement will never
       * converge on it: release it explicitly and say what happened rather than
       * letting the row snap back unexplained. */
      onError: () => {
        setLiveEntries(null);
        showToast({
          message: localize('com_ui_reorder_error'),
          severity: NotificationSeverity.ERROR,
          showIcon: true,
        });
      },
    });
  }, [updatePinnedOrder, favoritesData, isFiltered, storedOrder, showToast, localize]);

  /* `moveEntryBy` is declared above `commitOrder` and both are stable across a
   * drag, so the commit is reached through a ref rather than reordering them
   * into a dependency cycle. */
  const commitOrderRef = useRef(commitOrder);
  commitOrderRef.current = commitOrder;

  /* `FavoriteItem` reports the removal only once its row is already gone, so
   * there is no position left to search around: focus goes to the first
   * surviving row, matching what the favorites list did before this merge. */
  const handleRemoveFocus = useCallback(() => {
    focusFirstRow(sectionRef.current);
  }, []);

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

  const conversationByKey = useMemo(
    () => new Map(conversations.map((convo) => [convo.conversationId ?? '', convo])),
    [conversations],
  );

  /** The section root is both the pin drop target and the scope focus falls
   *  back into when a row is removed. */
  const setSectionRef = useCallback(
    (node: HTMLDivElement | null) => {
      sectionRef.current = node;
      pinDropRef(node);
    },
    [pinDropRef],
  );

  /* The section renders while either half is present or still resolving, and
   * drops out only once both are definitively empty. A live conversation drag
   * keeps it mounted as a drop target even when empty. */
  if (naturalEntries.length === 0 && !favoritesData.isLoading && !draggingConversation) {
    return null;
  }

  return (
    <div
      ref={setSectionRef}
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
          <p className="sr-only">{localize('com_ui_pinned_reorder_hint')}</p>
          <p className="sr-only" role="status" aria-live="polite">
            {announcement}
          </p>
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
                      indexOfKey={indexOfKey}
                      moveEntry={moveEntry}
                      moveEntryBy={moveEntryBy}
                      onDrop={commitOrder}
                      canDrag={renamingKey !== entry.key}
                    >
                      <Convo
                        conversation={convo}
                        retainView={noop}
                        toggleNav={toggleNav}
                        isGenerating={activeJobIds.has(convo.conversationId ?? '')}
                        onRenamingChange={(renaming) => setRenamingKey(renaming ? entry.key : null)}
                      />
                    </DraggablePinnedRow>
                  </li>
                );
              }
              return (
                <li key={entry.key} className="list-none">
                  <DraggablePinnedRow
                    entry={entry}
                    indexOfKey={indexOfKey}
                    moveEntry={moveEntry}
                    moveEntryBy={moveEntryBy}
                    onDrop={commitOrder}
                  >
                    <FavoriteRow
                      favorite={entry.favorite}
                      agentsMap={favoritesData.agentsMap}
                      specsMap={favoritesData.specsMap}
                      endpointsConfig={favoritesData.endpointsConfig}
                      isAgentsLoading={favoritesData.isAgentsLoading}
                      onSelectEndpoint={handleSelectEndpoint}
                      onSelectSpec={handleSelectSpec}
                      onRemoveFocus={handleRemoveFocus}
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
