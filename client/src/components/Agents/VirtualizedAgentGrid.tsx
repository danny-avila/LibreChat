import React, { useCallback, useLayoutEffect, useMemo, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { OGDialog } from '@librechat/client';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import type { Range } from '@tanstack/react-virtual';
import type t from 'librechat-data-provider';
import { BACKDROP_ENTER_TRANSITION, BACKDROP_EXIT_TRANSITION, MORPH_HANDOFF_MS } from './morph';
import AgentDetailContent from './AgentDetailContent';
import AgentCard from './AgentCard';

interface VirtualizedAgentGridProps {
  agents: t.Agent[];
  scrollElementRef: React.RefObject<HTMLElement>;
  label: string;
  hasNextPage: boolean;
  isFetching: boolean;
  onLoadMore: () => void;
  onSelectAgent?: (agent: t.Agent) => void;
}

const OVERSCAN_ROWS = 2;
const WINDOW_THRESHOLD = 32;
const FOCUSABLE = 'button:not(:disabled), a[href]';
/** Just under the dialog's own overlay layer, so the dim covers the grid only. */
const BACKDROP_Z_INDEX = 129;
/** Above sibling cards, below the dim, so a morphing card never clips a neighbour. */
const LIFTED_ROW_Z_INDEX = 20;

/** One measured row per virtual item preserves the existing 1–4-column card layout. */
export default function VirtualizedAgentGrid({
  agents,
  scrollElementRef,
  label,
  hasNextPage,
  isFetching,
  onLoadMore,
  onSelectAgent,
}: VirtualizedAgentGridProps) {
  const [listElement, setListElement] = useState<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState({ columns: 1, width: 0, gap: 20, margin: 0, estimate: 300 });
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null);
  /**
   * `closing` keeps the dialog mounted after Radix reports the close so its
   * dialog-only content can leave before the shared surface is handed back to
   * the card; the card stays put for both phases so the grid never reflows.
   */
  const [selection, setSelection] = useState<{
    agent: t.Agent;
    phase: 'open' | 'closing';
  } | null>(null);
  /**
   * The card whose surface is taking part in the morph. It outlives `selection`
   * because the contraction runs after the dialog has already handed the
   * surface back, and it has to stay above its neighbours until then.
   */
  const [liftedAgentId, setLiftedAgentId] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(closeTimerRef.current), []);
  const selectedTriggerRef = useRef<HTMLButtonElement>(null);
  const resizeAnchorRef = useRef<number | null>(null);
  const pendingFocusRef = useRef<{ id: string; backwards: boolean } | null>(null);
  const rowCount = Math.ceil(agents.length / layout.columns);
  const windowed = agents.length > WINDOW_THRESHOLD;

  const indexById = useMemo(() => {
    const indexes = new Map<string, number>();
    for (let index = 0; index < agents.length; index++) {
      indexes.set(agents[index].id, index);
    }
    return indexes;
  }, [agents]);
  const focusedIndex = focusedAgentId == null ? undefined : indexById.get(focusedAgentId);
  const selectedIndex = selection ? indexById.get(selection.agent.id) : undefined;
  const focusedRow = focusedIndex == null ? undefined : Math.floor(focusedIndex / layout.columns);
  const selectedRow =
    selectedIndex == null ? undefined : Math.floor(selectedIndex / layout.columns);
  const liftedIndex = liftedAgentId == null ? undefined : indexById.get(liftedAgentId);
  const liftedRow = liftedIndex == null ? undefined : Math.floor(liftedIndex / layout.columns);
  /** No source card in the list, or reduced motion: the dialog just fades. */
  const morphing = reducedMotion !== true && selection != null && selectedIndex != null;

  const getScrollElement = useCallback(() => scrollElementRef.current, [scrollElementRef]);
  const estimateSize = useCallback(() => layout.estimate, [layout.estimate]);
  const getItemKey = useCallback(
    (index: number) => `${layout.columns}:${agents[index * layout.columns]?.id ?? index}`,
    [agents, layout.columns],
  );
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      for (const row of [focusedRow, selectedRow, liftedRow]) {
        if (row != null && row < range.count && !indexes.includes(row)) {
          indexes.push(row);
        }
      }
      return indexes.sort((a, b) => a - b);
    },
    [focusedRow, liftedRow, selectedRow],
  );
  const virtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
    enabled: listElement != null && layout.width > 0 && scrollElementRef.current != null,
    count: rowCount,
    getScrollElement,
    estimateSize,
    getItemKey,
    rangeExtractor,
    overscan: OVERSCAN_ROWS,
    gap: layout.gap,
    scrollMargin: layout.margin,
  });

  useLayoutEffect(() => {
    const frame = scrollElementRef.current;
    if (!listElement || !frame) {
      return;
    }
    frame.scrollTop = 0;
    const updateLayout = () => {
      const rect = listElement.getBoundingClientRect();
      if (rect.width === 0) {
        return;
      }
      const style = getComputedStyle(listElement);
      const columns = Math.max(1, Math.min(4, style.gridTemplateColumns.split(' ').length));
      const fontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const next = {
        columns,
        width: rect.width,
        gap: parseFloat(style.rowGap) || 0,
        margin: rect.top - frame.getBoundingClientRect().top - frame.clientTop + frame.scrollTop,
        estimate: fontSize * 18.75,
      };
      const previous = layoutRef.current;
      if (
        previous.width === next.width &&
        previous.columns === next.columns &&
        previous.gap === next.gap &&
        previous.margin === next.margin &&
        previous.estimate === next.estimate
      ) {
        return;
      }
      if (previous.width > 0 && previous.columns !== columns) {
        resizeAnchorRef.current = (virtualizer.range?.startIndex ?? 0) * previous.columns;
      }
      layoutRef.current = next;
      setLayout(next);
    };
    updateLayout();
    const observer = new ResizeObserver(updateLayout);
    observer.observe(listElement);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [listElement, scrollElementRef, virtualizer]);

  useLayoutEffect(() => {
    const anchor = resizeAnchorRef.current;
    if (anchor == null || rowCount === 0) {
      return;
    }
    resizeAnchorRef.current = null;
    virtualizer.scrollToIndex(Math.min(rowCount - 1, Math.floor(anchor / layout.columns)), {
      align: 'start',
    });
  }, [layout.columns, rowCount, virtualizer]);

  const virtualRows = virtualizer.getVirtualItems();
  const visibleEnd = virtualizer.range?.endIndex;
  useEffect(() => {
    if (
      hasNextPage &&
      !isFetching &&
      visibleEnd != null &&
      visibleEnd + OVERSCAN_ROWS >= rowCount - 1
    ) {
      onLoadMore();
    }
  }, [hasNextPage, isFetching, onLoadMore, rowCount, visibleEnd]);

  const handleSelect = useCallback(
    (agent: t.Agent) => {
      clearTimeout(closeTimerRef.current);
      setFocusedAgentId(agent.id);
      setSelection({ agent, phase: 'open' });
      if (reducedMotion !== true) {
        setLiftedAgentId(agent.id);
      }
      onSelectAgent?.(agent);
    },
    [onSelectAgent, reducedMotion],
  );
  /**
   * Radix reports the close for every route out of the dialog — close button,
   * Escape and backdrop — so the reverse morph is driven from one place. The
   * card is remounted with the dialog in a single commit, which is what lets
   * the projection hand the surface straight back without a crossfade. The
   * selection is never dropped synchronously: `OGDialog` restores focus to the
   * selected card's trigger in a macrotask, so that card has to stay mounted
   * until after it runs, reduced motion included.
   */
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        return;
      }
      clearTimeout(closeTimerRef.current);
      setSelection((current) => (current == null ? current : { ...current, phase: 'closing' }));
      closeTimerRef.current = setTimeout(
        () => setSelection(null),
        reducedMotion === true ? 0 : MORPH_HANDOFF_MS,
      );
    },
    [reducedMotion],
  );
  const handleFocus = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      if (!(event.target instanceof Element) || !event.currentTarget.contains(event.target)) {
        return;
      }
      const item = event.target.closest<HTMLElement>('[data-agent-index]');
      const agent = item ? agents[Number(item.dataset.agentIndex)] : undefined;
      if (agent) {
        setFocusedAgentId(agent.id);
      }
    },
    [agents],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        event.key !== 'Tab' ||
        !(event.target instanceof HTMLElement) ||
        !event.currentTarget.contains(event.target)
      ) {
        return;
      }
      const item = event.target.closest<HTMLElement>('[data-agent-index]');
      if (!item) {
        return;
      }
      const controls = item.querySelectorAll<HTMLElement>(FOCUSABLE);
      const boundary = event.shiftKey ? controls[0] : controls[controls.length - 1];
      if (event.target !== boundary) {
        return;
      }
      const index = Number(item.dataset.agentIndex) + (event.shiftKey ? -1 : 1);
      const nextAgent = agents[index];
      if (!nextAgent || event.currentTarget.querySelector(`[data-agent-index="${index}"]`)) {
        return;
      }
      event.preventDefault();
      pendingFocusRef.current = { id: nextAgent.id, backwards: event.shiftKey };
      setFocusedAgentId(nextAgent.id);
      virtualizer.scrollToIndex(Math.floor(index / layout.columns), { align: 'auto' });
    },
    [agents, layout.columns, virtualizer],
  );

  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    const index = pending ? indexById.get(pending.id) : undefined;
    if (!pending || index == null || !listElement) {
      return;
    }
    const item = listElement.querySelector(`[data-agent-index="${index}"]`);
    const controls = item?.querySelectorAll<HTMLElement>(FOCUSABLE);
    const target = pending.backwards ? controls?.[controls.length - 1] : controls?.[0];
    if (target) {
      pendingFocusRef.current = null;
      target.focus();
    }
  }, [focusedAgentId, indexById, listElement, virtualRows]);

  const rows = windowed
    ? virtualRows
    : Array.from({ length: rowCount }, (_, index) => ({ index, key: getItemKey(index), start: 0 }));
  const columns = `repeat(${layout.columns}, minmax(0, 1fr))`;

  return (
    <OGDialog
      open={selection?.phase === 'open'}
      onOpenChange={handleOpenChange}
      triggerRef={selectedTriggerRef}
    >
      <div
        role="list"
        ref={setListElement}
        className="relative grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,max(20rem,calc((100%_-_3.75rem)/4))),1fr))] gap-5"
        style={windowed ? { height: virtualizer.getTotalSize() } : undefined}
        aria-label={label}
        onFocusCapture={handleFocus}
        onKeyDownCapture={handleKeyDown}
      >
        {rows.map((row) => {
          const cards: React.ReactNode[] = [];
          const end = Math.min((row.index + 1) * layout.columns, agents.length);
          for (let index = row.index * layout.columns; index < end; index++) {
            const agent = agents[index];
            const selected = selection?.agent.id === agent.id;
            cards.push(
              <div
                key={agent.id}
                role="listitem"
                aria-posinset={index + 1}
                aria-setsize={agents.length}
                data-agent-index={index}
                className={
                  agent.id === liftedAgentId ? 'relative h-full min-w-0' : 'h-full min-w-0'
                }
                style={agent.id === liftedAgentId ? { zIndex: LIFTED_ROW_Z_INDEX } : undefined}
              >
                <AgentCard
                  agent={agent}
                  onSelect={handleSelect}
                  expanded={selected}
                  morphing={agent.id === liftedAgentId}
                  ref={selected ? selectedTriggerRef : undefined}
                />
              </div>,
            );
          }
          return (
            <div
              key={row.key}
              role="presentation"
              data-index={row.index}
              ref={virtualizer.measureElement}
              className={
                windowed
                  ? 'absolute left-0 top-0 grid w-full items-stretch gap-5'
                  : 'relative col-span-full grid items-stretch gap-5'
              }
              style={{
                gridTemplateColumns: columns,
                ...(windowed ? { transform: `translateY(${row.start - layout.margin}px)` } : {}),
                ...(row.index === liftedRow ? { zIndex: LIFTED_ROW_Z_INDEX } : {}),
              }}
            >
              {cards}
            </div>
          );
        })}
      </div>
      {createPortal(
        <AnimatePresence onExitComplete={() => setLiftedAgentId(null)}>
          {morphing && (
            <motion.div
              key="agent-detail-backdrop"
              aria-hidden="true"
              className="pointer-events-none fixed inset-0 bg-black/80"
              style={{ zIndex: BACKDROP_Z_INDEX }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: BACKDROP_ENTER_TRANSITION }}
              exit={{ opacity: 0, transition: BACKDROP_EXIT_TRANSITION }}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}
      {selection != null && (
        <AgentDetailContent
          agent={selection.agent}
          /* Without a mounted source card — the filters or the search moved on
             — there is nothing to morph from, so the dialog just fades. */
          morph={morphing ? selection.phase : undefined}
        />
      )}
    </OGDialog>
  );
}
