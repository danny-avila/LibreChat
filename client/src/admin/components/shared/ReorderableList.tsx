import { useState, useCallback, useRef } from 'react';
import type * as t from '~/admin/types';
import { useReorderVoiceover, useAnnouncement, useLocalize } from '~/admin/hooks';
import { ScreenReaderAnnouncer } from './ScreenReaderAnnouncer';
import { SortableList, arrayMove } from './SortableList';
import { LoadingState } from './LoadingState';
import { SearchInput } from './SearchInput';
import { EmptyState } from './EmptyState';
import { cn } from '~/admin/utils';

export function ReorderableList<T extends { id: string }>({
  items,
  isLoading,
  filterFn,
  renderItemContent,
  searchPlaceholder,
  emptyMessage,
  reorderHint,
  onSaveOrder,
  onDirtyChange,
  actionRef,
  headerAction,
  children,
  reorderDisabled,
}: t.ReorderableListProps<T>) {
  const localize = useLocalize();
  const { message: announcement, announce } = useAnnouncement();
  const voiceover = useReorderVoiceover();
  const [search, setSearch] = useState('');
  const [prevItems, setPrevItems] = useState(items);
  const [orderedItems, setOrderedItems] = useState(items);

  if (items !== prevItems) {
    setPrevItems(items);
    setOrderedItems(items);
  }

  const isSearching = search.length > 0;
  const isDirty =
    orderedItems.length > 0 &&
    items.map((i) => i.id).join(',') !== orderedItems.map((i) => i.id).join(',');

  const filtered = orderedItems.filter((item) => {
    if (!isSearching) return true;
    return filterFn(item, search.toLowerCase());
  });

  const handleSearchChange = (value: string) => {
    setSearch(value);
    const q = value.toLowerCase();
    const count = orderedItems.filter((item) => !q || filterFn(item, q)).length;
    announce(localize('com_admin_a11y_results_found', { count }));
  };

  const handleReorder = useCallback(
    ({ oldIndex, newIndex }: { oldIndex: number; newIndex: number }) => {
      let draggedId: string | undefined;
      setOrderedItems((prev) => {
        draggedId = prev[oldIndex].id;
        return arrayMove(prev, oldIndex, newIndex);
      });
      queueMicrotask(() => {
        if (draggedId) {
          document.querySelector<HTMLElement>(`[data-item-id="${draggedId}"]`)?.focus();
        }
      });
    },
    [],
  );

  const showBar = isDirty && !isSearching;

  const prevShowBar = useRef(showBar);
  if (prevShowBar.current !== showBar) {
    prevShowBar.current = showBar;
    onDirtyChange?.(showBar);
  }

  if (actionRef) {
    actionRef.current = {
      discard: () => setOrderedItems(items),
      save: () => onSaveOrder(orderedItems.map((i) => i.id)),
    };
  }

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pt-0.5 pr-1">
      <div className="flex items-center justify-between gap-3">
        <SearchInput value={search} onChange={handleSearchChange} placeholder={searchPlaceholder} />
        {headerAction}
      </div>

      {!isSearching && !reorderDisabled && filtered.length > 1 && (
        <p className="text-xs text-(--cui-color-text-muted)">{reorderHint}</p>
      )}

      {filtered.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <SortableList
          values={filtered}
          onChange={handleReorder}
          disabled={isSearching || reorderDisabled}
          voiceover={voiceover}
          announce={announce}
          className="flex flex-col"
          handle={
            <span
              aria-hidden="true"
              className={cn(
                '-my-3 -mr-1.5 -ml-3 flex shrink-0 cursor-grab touch-none items-center self-stretch rounded-l-lg pr-3 pl-3 text-(--cui-color-text-disabled)',
                (isSearching || reorderDisabled) && 'invisible',
              )}
            >
              <svg width="12" height="20" viewBox="0 0 12 20" fill="currentColor">
                <circle cx="3" cy="4" r="1.5" />
                <circle cx="9" cy="4" r="1.5" />
                <circle cx="3" cy="10" r="1.5" />
                <circle cx="9" cy="10" r="1.5" />
                <circle cx="3" cy="16" r="1.5" />
                <circle cx="9" cy="16" r="1.5" />
              </svg>
            </span>
          }
          renderItem={(item, { isDragged, isSelected }, handle) => (
            <div
              className={cn(
                'mb-2 flex items-center gap-3 rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-panel) px-3 py-3 outline-none',
                isDragged && 'z-10 opacity-70',
                isSelected &&
                  'bg-(--cui-color-background-active) ring-2 ring-(--cui-color-outline) ring-inset',
              )}
            >
              {handle}
              {renderItemContent(item)}
            </div>
          )}
        />
      )}

      <ScreenReaderAnnouncer message={announcement} />

      {children}
    </div>
  );
}
