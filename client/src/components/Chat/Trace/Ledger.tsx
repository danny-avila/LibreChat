import { memo, useId, useMemo, useState } from 'react';
import { ChevronRight, CircleAlert, CircleDashed } from 'lucide-react';
import type { RefObject, CSSProperties, KeyboardEvent } from 'react';
import type { TraceModel, TraceNode, TraceRow, TraceTurn, TraceWindow } from './model';
import { formatClock, formatDuration, turnKey } from './model';
import { KIND_APPEARANCE, STATUS_LABEL } from './kinds';
import { formatTokens } from '~/utils/tokens';
import { useRowWindow } from './virtual';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 28;
const INDENT_PX = 14;
/** Shown only while the tree itself has keyboard focus, so a pointer user sees just the selection. */
const ACTIVE_RING =
  'group-focus-visible/tree:ring-2 group-focus-visible/tree:ring-inset group-focus-visible/tree:ring-ring-primary';
const GRID =
  'grid grid-cols-[minmax(0,1fr)_4.5rem_minmax(5rem,1fr)] md:grid-cols-[minmax(14rem,2fr)_5rem_4.5rem_minmax(10rem,3fr)]';

type Domain = { start: number; span: number };

const barStyle = (start: number, end: number, domain: Domain): CSSProperties => ({
  left: `${((start - domain.start) / domain.span) * 100}%`,
  width: `${((end - start) / domain.span) * 100}%`,
});

function RecordBar({ node, domain }: { node: TraceNode; domain: Domain }) {
  const { record } = node;
  const appearance = KIND_APPEARANCE[record.kind];
  const solid = record.status === 'error' ? 'bg-status-error' : appearance.bar;

  if (node.end == null) {
    return (
      <span
        className={cn('absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45', solid)}
        style={{ left: `${((node.start - domain.start) / domain.span) * 100}%` }}
      />
    );
  }

  const duration = node.end - node.start;
  const ttftShare =
    node.firstToken != null && duration > 0 ? (node.firstToken - node.start) / duration : 0;
  return (
    <span
      className="absolute top-1/2 flex h-2.5 min-w-[2px] -translate-y-1/2 overflow-hidden rounded-sm"
      style={barStyle(node.start, node.end, domain)}
    >
      {ttftShare > 0 && (
        <span
          className={cn(
            'h-full',
            record.status === 'error' ? 'bg-status-error/40' : appearance.tint,
          )}
          style={{ width: `${ttftShare * 100}%` }}
        />
      )}
      <span className={cn('h-full flex-1', solid)} />
    </span>
  );
}

function TurnBar({ turn, domain }: { turn: TraceTurn; domain: Domain }) {
  return (
    <span
      className="absolute top-1/2 h-1 min-w-[2px] -translate-y-1/2 rounded-full bg-border-heavy"
      style={barStyle(turn.start, turn.end, domain)}
    />
  );
}

function recordTokens(node: TraceNode): string {
  const usage = node.record.usage;
  if (node.record.kind !== 'generation' || usage == null) {
    return '';
  }
  const total = usage.total ?? (usage.input ?? 0) + (usage.output ?? 0);
  return total > 0 ? formatTokens(total) : '';
}

const toDomain = (start: number, end: number): Domain => ({
  start,
  span: Math.max(end - start, 1),
});

/**
 * The hierarchical record list: one row per turn and per record. Each bar is
 * scaled to its own response, so a short turn in a long conversation stays
 * legible, until an interval is focused and every row shares that scale. Rows
 * are windowed, and the tree follows the ARIA tree pattern through
 * `aria-activedescendant` so the active row need not be mounted to be announced.
 */
function Ledger({
  rows,
  model,
  view,
  selectedId,
  treeRef,
  onSelect,
  onToggle,
}: {
  rows: TraceRow[];
  model: TraceModel;
  view: TraceWindow | null;
  selectedId: string | null;
  treeRef: RefObject<HTMLDivElement>;
  onSelect: (id: string) => void;
  onToggle: (key: string) => void;
}) {
  const localize = useLocalize();
  const idPrefix = useId();
  const scrollRef = treeRef;
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const { first, last } = useRowWindow(scrollRef, rows.length, ROW_HEIGHT, {
    offset: HEADER_HEIGHT,
  });

  const indexByKey = useMemo(() => new Map(rows.map((row, index) => [row.key, index])), [rows]);
  const turnDomains = useMemo(
    () => new Map(model.turns.map((turn) => [turn.messageId, toDomain(turn.start, turn.end)])),
    [model],
  );
  const viewDomain = useMemo(() => (view ? toDomain(view.start, view.end) : null), [view]);
  const domainFor = (messageId: string): Domain =>
    viewDomain ?? turnDomains.get(messageId) ?? toDomain(model.start, model.end);
  const activeIndex = activeKey != null ? (indexByKey.get(activeKey) ?? 0) : 0;
  const activeRow = rows[activeIndex];
  const rowId = (key: string) => `${idPrefix}-${key}`;

  /** Keeps a keyboard-moved row inside the viewport so its windowed element mounts. */
  const scrollIntoView = (index: number) => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    const top = index * ROW_HEIGHT;
    if (top < element.scrollTop) {
      element.scrollTop = top;
    } else if (HEADER_HEIGHT + top + ROW_HEIGHT > element.scrollTop + element.clientHeight) {
      element.scrollTop = HEADER_HEIGHT + top + ROW_HEIGHT - element.clientHeight;
    }
  };

  const moveTo = (index: number) => {
    const clamped = Math.min(Math.max(index, 0), rows.length - 1);
    const row = rows[clamped];
    scrollIntoView(clamped);
    if (row) {
      setActiveKey(row.key);
    }
  };

  const activate = (row: TraceRow) => {
    setActiveKey(row.key);
    if (row.type === 'record') {
      onSelect(row.key);
    } else {
      onToggle(row.key);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!activeRow) {
      return;
    }
    const expandable = activeRow.type === 'turn' || activeRow.hasChildren;
    const pageSize = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 0) / ROW_HEIGHT));
    const handlers: Record<string, () => void> = {
      ArrowDown: () => moveTo(activeIndex + 1),
      ArrowUp: () => moveTo(activeIndex - 1),
      PageDown: () => moveTo(activeIndex + pageSize),
      PageUp: () => moveTo(activeIndex - pageSize),
      Home: () => moveTo(0),
      End: () => moveTo(rows.length - 1),
      ArrowRight: () => {
        if (expandable && !activeRow.expanded) {
          onToggle(activeRow.key);
        } else if (expandable) {
          moveTo(activeIndex + 1);
        }
      },
      ArrowLeft: () => {
        if (expandable && activeRow.expanded) {
          onToggle(activeRow.key);
          return;
        }
        if (activeRow.type === 'record') {
          const { node } = activeRow;
          const parentKey = node.parentId ?? turnKey(node.record.messageId);
          const parentIndex = indexByKey.get(parentKey);
          if (parentIndex != null) {
            moveTo(parentIndex);
          }
        }
      },
      Enter: () => activate(activeRow),
      ' ': () => activate(activeRow),
    };
    const handler = handlers[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  };

  const renderRow = (row: TraceRow, index: number) => {
    const style: CSSProperties = { top: HEADER_HEIGHT + index * ROW_HEIGHT, height: ROW_HEIGHT };
    const active = activeRow?.key === row.key;
    const common = {
      id: rowId(row.key),
      role: 'treeitem',
      'aria-posinset': row.position,
      'aria-setsize': row.setSize,
      style,
      onClick: () => activate(row),
    };

    if (row.type === 'turn') {
      const { turn } = row;
      const label = localize('com_ui_trace_turn', { 0: formatClock(turn.start) });
      return (
        <div
          key={row.key}
          {...common}
          aria-level={1}
          aria-expanded={row.expanded}
          aria-label={`${label}, ${localize('com_ui_trace_turn_records', { 0: String(turn.recordCount) })}, ${formatDuration(turn.end - turn.start)}`}
          className={cn(
            GRID,
            'absolute inset-x-0 cursor-pointer items-center gap-2 border-t border-border-light bg-surface-primary-alt px-2 text-xs font-semibold text-text-primary hover:bg-surface-hover',
            active && ACTIVE_RING,
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <ChevronRight
              aria-hidden="true"
              className={cn(
                'size-3.5 shrink-0 text-text-secondary transition-transform motion-reduce:transition-none',
                row.expanded && 'rotate-90',
              )}
            />
            <span className="truncate">{label}</span>
            {turn.errorCount > 0 && (
              <CircleAlert aria-hidden="true" className="size-3.5 shrink-0 text-status-error" />
            )}
          </span>
          <span className="text-right font-normal tabular-nums text-text-secondary">
            {formatDuration(turn.end - turn.start)}
          </span>
          <span className="hidden md:block" />
          <span className="relative h-full overflow-hidden">
            <TurnBar turn={turn} domain={domainFor(turn.messageId)} />
          </span>
        </div>
      );
    }

    const { node } = row;
    const { record } = node;
    const turnStart = turnDomains.get(record.messageId)?.start ?? model.start;
    const appearance = KIND_APPEARANCE[record.kind];
    const Icon = appearance.icon;
    const running = node.end == null;
    const duration = running
      ? localize(STATUS_LABEL.running)
      : formatDuration((node.end ?? node.start) - node.start);
    const statusText =
      record.status === 'error' || record.status === 'warning'
        ? `${duration}, ${localize(STATUS_LABEL[record.status])}`
        : duration;

    return (
      <div
        key={row.key}
        {...common}
        aria-level={node.depth + 2}
        aria-expanded={row.hasChildren ? row.expanded : undefined}
        aria-selected={selectedId === row.key}
        aria-label={localize('com_ui_trace_bar_description', {
          0: `${record.name}, ${localize(appearance.label)}`,
          1: formatDuration(node.start - turnStart),
          2: statusText,
        })}
        className={cn(
          GRID,
          'absolute inset-x-0 cursor-pointer items-center gap-2 px-2 text-sm text-text-primary hover:bg-surface-hover',
          selectedId === row.key && 'bg-surface-active-alt',
          active && ACTIVE_RING,
        )}
      >
        <span
          className="flex min-w-0 items-center gap-1.5"
          style={{ paddingLeft: node.depth * INDENT_PX }}
        >
          <span
            aria-hidden="true"
            onClick={(event) => {
              if (row.hasChildren) {
                event.stopPropagation();
                setActiveKey(row.key);
                onToggle(row.key);
              }
            }}
            className="flex size-4 shrink-0 items-center justify-center"
          >
            {row.hasChildren && (
              <ChevronRight
                className={cn(
                  'size-3.5 text-text-secondary transition-transform motion-reduce:transition-none',
                  row.expanded && 'rotate-90',
                )}
              />
            )}
          </span>
          <Icon aria-hidden="true" className="size-3.5 shrink-0 text-text-secondary" />
          <span className="min-w-[3ch] truncate">{record.name}</span>
          {record.model != null && (
            <span className="hidden min-w-0 shrink-[4] truncate text-xs text-text-secondary sm:inline">
              {record.model}
            </span>
          )}
          {record.status === 'error' && (
            <CircleAlert aria-hidden="true" className="size-3.5 shrink-0 text-status-error" />
          )}
          {running && (
            <CircleDashed aria-hidden="true" className="size-3.5 shrink-0 text-text-secondary" />
          )}
        </span>
        <span className="truncate text-right text-xs tabular-nums text-text-secondary">
          {duration}
        </span>
        <span className="hidden text-right text-xs tabular-nums text-text-secondary md:block">
          {recordTokens(node)}
        </span>
        <span className="relative h-full overflow-hidden">
          <RecordBar node={node} domain={domainFor(record.messageId)} />
        </span>
      </div>
    );
  };

  const visibleRows: JSX.Element[] = [];
  for (let index = first; index <= last && index < rows.length; index++) {
    visibleRows.push(renderRow(rows[index], index));
  }

  return (
    <div
      ref={scrollRef}
      role="tree"
      tabIndex={0}
      aria-label={localize('com_ui_trace_records')}
      aria-activedescendant={activeRow ? rowId(activeRow.key) : undefined}
      onKeyDown={handleKeyDown}
      onFocus={() => {
        if (activeKey == null && rows[0]) {
          setActiveKey(rows[0].key);
        }
      }}
      data-testid="trace-ledger"
      className="group/tree relative min-h-0 flex-1 overflow-auto focus-visible:outline-none"
    >
      <div
        aria-hidden="true"
        className={cn(
          GRID,
          'sticky top-0 z-10 h-7 items-center gap-2 border-b border-border-light bg-presentation px-2 text-[11px] font-medium uppercase tracking-wide text-text-secondary',
        )}
      >
        <span>{localize('com_ui_trace_column_name')}</span>
        <span className="text-right">{localize('com_ui_trace_column_duration')}</span>
        <span className="hidden text-right md:block">{localize('com_ui_trace_column_tokens')}</span>
        {viewDomain ? (
          <span className="flex justify-between normal-case tabular-nums tracking-normal">
            <span>{formatDuration(viewDomain.start - model.start)}</span>
            <span>{formatDuration(viewDomain.start + viewDomain.span - model.start)}</span>
          </span>
        ) : (
          <span>{localize('com_ui_trace_column_timeline')}</span>
        )}
      </div>
      <div role="presentation" style={{ height: rows.length * ROW_HEIGHT }}>
        {visibleRows}
      </div>
    </div>
  );
}

export default memo(Ledger);
