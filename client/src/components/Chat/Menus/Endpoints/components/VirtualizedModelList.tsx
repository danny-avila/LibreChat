import { useRemScale } from '@librechat/client';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { List } from 'react-virtualized';
import * as Ariakit from '@ariakit/react';
import type { ListRowProps } from 'react-virtualized';
import type { Endpoint } from '~/common';
import { EndpointModelItem } from './EndpointModelItem';

/** Matches the rendered height of a `CustomMenuItem` row (px-2 py-1 around a py-1 body). */
const ROW_HEIGHT = 36;
const MAX_LIST_HEIGHT = 320;
const OVERSCAN = 8;

interface VirtualizedModelListProps {
  endpoint: Endpoint;
  modelIds: string[];
  globalByName: Map<string, boolean>;
  isFavorite: (modelId: string) => boolean;
  onToggleFavorite: (modelId: string) => void;
  endpointIndex?: number;
  /** Count of options rendered ahead of this list in the same listbox (marketplace entry,
   *  model specs), so `aria-posinset` is relative to the whole listbox and not just this list. */
  precedingOptionCount: number;
}

/**
 * Windowed model list for endpoints with very large model sets (agents, mainly).
 *
 * Only the visible slice is mounted, so the per-row costs — Ariakit composite
 * registration, the active-item subscription, and ~12 DOM nodes each — stay
 * bounded no matter how many agents the user can see.
 *
 * Ariakit's composite only knows about mounted rows, so arrow-keying to the edge
 * of the window would otherwise find no next item and let focus escape the nested
 * menu, closing it. `handleBoundaryNavigation` catches that case: it scrolls the
 * next index into the window, waits for the row to mount, then moves the composite
 * onto it. Navigation inside the window is left entirely to Ariakit, whose own
 * `scrollIntoView` drives the list's scroll position.
 */
export default function VirtualizedModelList({
  endpoint,
  modelIds,
  globalByName,
  isFavorite,
  onToggleFavorite,
  endpointIndex,
  precedingOptionCount,
}: VirtualizedModelListProps) {
  const listRef = useRef<List>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const combobox = Ariakit.useComboboxContext();
  const remScale = useRemScale();
  const indexSuffix = endpointIndex != null ? `-${endpointIndex}` : '';
  const rowCount = modelIds.length;

  const rowAt = useCallback(
    (index: number) =>
      containerRef.current?.querySelector<HTMLElement>(
        `[data-row-index="${index}"] [role="option"], [data-row-index="${index}"] [role="menuitem"]`,
      ) ?? null,
    [],
  );

  useEffect(() => {
    if (!combobox) {
      return;
    }
    const deltaFor = (key: string) => {
      if (key === 'ArrowDown') {
        return 1;
      }
      return key === 'ArrowUp' ? -1 : 0;
    };
    const handleBoundaryNavigation = (event: KeyboardEvent) => {
      const delta = deltaFor(event.key);
      if (delta === 0) {
        return;
      }
      const activeId = combobox.getState().activeId;
      const activeRow = activeId ? document.getElementById(activeId) : null;
      const wrapper = activeRow?.closest<HTMLElement>('[data-row-index]');
      if (!wrapper || !containerRef.current?.contains(wrapper)) {
        return;
      }
      const next = Number(wrapper.dataset.rowIndex) + delta;
      /** Let Ariakit own both the in-window case and the ends of the list. */
      if (next < 0 || next >= rowCount || rowAt(next)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      listRef.current?.scrollToRow(next);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const id = rowAt(next)?.id;
          if (id) {
            combobox.move(id);
          }
        });
      });
    };
    document.addEventListener('keydown', handleBoundaryNavigation, true);
    return () => document.removeEventListener('keydown', handleBoundaryNavigation, true);
  }, [combobox, rowCount, rowAt]);

  const rowHeight = ROW_HEIGHT * remScale;
  const height = useMemo(
    () => Math.min(MAX_LIST_HEIGHT * remScale, Math.max(rowHeight, rowCount * rowHeight)),
    [rowCount, rowHeight, remScale],
  );

  const rowRenderer = useCallback(
    ({ index, key, style }: ListRowProps) => {
      const modelId = modelIds[index];
      return (
        <div key={key} style={style} data-row-index={index}>
          <EndpointModelItem
            modelId={modelId}
            endpoint={endpoint}
            isGlobal={globalByName.get(modelId) ?? false}
            isFavorite={isFavorite(modelId)}
            onToggleFavorite={onToggleFavorite}
            posInSet={precedingOptionCount + index + 1}
            setSize={precedingOptionCount + rowCount}
          />
        </div>
      );
    },
    [
      endpoint,
      globalByName,
      isFavorite,
      modelIds,
      onToggleFavorite,
      precedingOptionCount,
      rowCount,
    ],
  );

  return (
    <div ref={containerRef} data-endpoint-models={`${endpoint.value}${indexSuffix}`}>
      <List
        ref={listRef}
        width={360}
        height={height}
        rowCount={rowCount}
        rowHeight={rowHeight}
        overscanRowCount={OVERSCAN}
        rowRenderer={rowRenderer}
        className="outline-none!"
        style={{ width: '100%' }}
        /**
         * `List` spreads its props onto the underlying `Grid`, whose defaults are
         * `role="grid"`, `containerRole="row"` and `tabIndex={0}`. Left alone, that puts a
         * focusable grid between Ariakit's listbox and its options: tabbing out of the
         * search field lands on the wrapper instead of a row, where the combobox no longer
         * owns the keystroke, and the grid/row semantics fight the surrounding listbox.
         * Neutralise both so focus and ARIA stay with the combobox items.
         */
        role="presentation"
        containerRole="presentation"
        tabIndex={-1}
      />
    </div>
  );
}
