import { memo, useId, useMemo, useState } from 'react';
import { ChevronRight, CircleAlert, CircleDashed } from 'lucide-react';
import type { RefObject, CSSProperties, KeyboardEvent } from 'react';
import type {
  TraceRow,
  TraceNode,
  TraceStep,
  TraceTurn,
  TraceSpan,
  TraceModel,
  TraceScale,
  TraceWindow,
} from './model';
import { spanOf, stepSpan, turnSpan, turnKey, boundsOf } from './model';
import { useTraceFormat, recordDurationText } from './format';
import { KIND_APPEARANCE, STATUS_LABEL } from './kinds';
import { formatTokens } from '~/utils/tokens';
import { useRowWindow } from './virtual';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 28;
const INDENT_PX = 14;
/** Tool names a step header lists before summarizing the rest as a count. */
const STEP_TOOL_NAMES = 3;
/** Shown only while the tree itself has keyboard focus, so a pointer user sees just the selection. */
const ACTIVE_RING =
  'group-focus-visible/tree:ring-2 group-focus-visible/tree:ring-inset group-focus-visible/tree:ring-ring-primary';
const GRID =
  'grid grid-cols-[minmax(0,1fr)_4.5rem_minmax(5rem,1fr)] md:grid-cols-[minmax(14rem,2fr)_5rem_4.5rem_minmax(10rem,3fr)]';

type Domain = { start: number; span: number };

const barStyle = (span: TraceSpan, domain: Domain): CSSProperties => ({
  left: `${((span.start - domain.start) / domain.span) * 100}%`,
  width: `${((span.end - span.start) / domain.span) * 100}%`,
});

function RecordBar({
  node,
  scale,
  domain,
}: {
  node: TraceNode;
  scale: TraceScale;
  domain: Domain;
}) {
  const { record } = node;
  const appearance = KIND_APPEARANCE[record.kind];
  const solid = record.status === 'error' ? 'bg-status-error' : appearance.bar;

  if (scale === 'time' && node.end == null) {
    return (
      <span
        className={cn('absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45', solid)}
        style={{ left: `${((node.start - domain.start) / domain.span) * 100}%` }}
      />
    );
  }

  const span = spanOf(node, scale);
  const duration = span.end - span.start;
  const ttftShare =
    scale === 'time' && node.firstToken != null && duration > 0
      ? (node.firstToken - node.start) / duration
      : 0;
  return (
    <span
      className="absolute top-1/2 flex h-2.5 min-w-[2px] -translate-y-1/2 overflow-hidden rounded-sm"
      style={barStyle(span, domain)}
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

function GroupBar({ span, domain }: { span: TraceSpan; domain: Domain }) {
  return (
    <span
      className="absolute top-1/2 h-1 min-w-[2px] -translate-y-1/2 rounded-full bg-border-heavy"
      style={barStyle(span, domain)}
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

const toDomain = (span: TraceSpan): Domain => ({
  start: span.start,
  span: Math.max(span.end - span.start, 1),
});

/**
 * The hierarchical record list: one row per turn, per step and per record. Each
 * bar is scaled to its own response, so a short turn in a long conversation
 * stays legible, until an interval is focused and every row shares that scale.
 * Rows are windowed, and the tree follows the ARIA tree pattern through
 * `aria-activedescendant`, which must name a mounted row, so the active row
 * stays rendered while the window scrolls away from it.
 */
function Ledger({
  rows,
  model,
  scale,
  view,
  selectedId,
  treeRef,
  previewFor,
  onSelect,
  onToggle,
}: {
  rows: TraceRow[];
  model: TraceModel;
  scale: TraceScale;
  view: TraceWindow | null;
  selectedId: string | null;
  treeRef: RefObject<HTMLDivElement>;
  previewFor: (node: TraceNode) => string | undefined;
  onSelect: (id: string) => void;
  onToggle: (key: string) => void;
}) {
  const localize = useLocalize();
  const format = useTraceFormat();
  const idPrefix = useId();
  const scrollRef = treeRef;
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const { first, last } = useRowWindow(scrollRef, rows.length, ROW_HEIGHT, {
    offset: HEADER_HEIGHT,
  });

  const indexByKey = useMemo(() => new Map(rows.map((row, index) => [row.key, index])), [rows]);
  const turnDomains = useMemo(
    () => new Map(model.turns.map((turn) => [turn.messageId, toDomain(turnSpan(turn, scale))])),
    [model, scale],
  );
  const viewDomain = useMemo(() => (view ? toDomain(view) : null), [view]);
  const bounds = boundsOf(model, scale);
  const domainFor = (messageId: string): Domain =>
    viewDomain ?? turnDomains.get(messageId) ?? toDomain(bounds);
  const activeIndex = activeKey != null ? (indexByKey.get(activeKey) ?? 0) : 0;
  const activeRow = rows[activeIndex];
  const rowId = (key: string) => `${idPrefix}-${key}`;
  const position = (value: number) =>
    scale === 'sequence' ? String(Math.round(value)) : format.duration(value - bounds.start);

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

  const parentKeyOf = (row: TraceRow): string | undefined => {
    if (row.type === 'turn') {
      return undefined;
    }
    if (row.type === 'step') {
      return turnKey(row.step.messageId);
    }
    const { node } = row;
    const stepParent = model.mode === 'simple' ? node.stepKey : null;
    return node.viewParentId ?? stepParent ?? turnKey(node.record.messageId);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!activeRow) {
      return;
    }
    const expandable = activeRow.type !== 'record' || activeRow.hasChildren;
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
        const parentKey = parentKeyOf(activeRow);
        const parentIndex = parentKey != null ? indexByKey.get(parentKey) : undefined;
        if (parentIndex != null) {
          moveTo(parentIndex);
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

  const chevron = (expanded: boolean) => (
    <ChevronRight
      aria-hidden="true"
      className={cn(
        'size-3.5 shrink-0 text-text-secondary transition-transform motion-reduce:transition-none',
        expanded && 'rotate-90',
      )}
    />
  );

  const turnSummary = (turn: TraceTurn) =>
    [
      localize(turn.steps === 1 ? 'com_ui_trace_steps_count_one' : 'com_ui_trace_steps_count', {
        count: turn.steps,
      }),
      localize(
        turn.toolCalls === 1
          ? 'com_ui_trace_tool_calls_count_one'
          : 'com_ui_trace_tool_calls_count',
        { count: turn.toolCalls },
      ),
    ].join(' · ');

  const stepDescription = (step: TraceStep) => {
    const names = [...step.toolNames];
    const tools = names
      .slice(0, STEP_TOOL_NAMES)
      .map(([name, count]) =>
        count > 1 ? localize('com_ui_trace_tool_times', { 0: name, 1: String(count) }) : name,
      );
    if (names.length > STEP_TOOL_NAMES) {
      tools.push(
        localize('com_ui_trace_tools_more', { 0: String(names.length - STEP_TOOL_NAMES) }),
      );
    }
    return [format.duration(step.end - step.start), ...tools].join(' · ');
  };

  const renderGroupRow = (
    row: Extract<TraceRow, { type: 'turn' | 'step' }>,
    index: number,
    {
      label,
      description,
      errorCount,
      recordCount,
      span,
      messageId,
      indent,
    }: {
      label: string;
      description: string;
      errorCount: number;
      recordCount: number;
      span: TraceSpan;
      messageId: string;
      indent: number;
    },
  ) => {
    const active = activeRow?.key === row.key;
    return (
      <div
        key={row.key}
        id={rowId(row.key)}
        role="treeitem"
        aria-posinset={row.position}
        aria-setsize={row.setSize}
        aria-level={row.level}
        aria-expanded={row.expanded}
        aria-selected={false}
        aria-label={`${label}, ${description}, ${localize('com_ui_trace_turn_records', { 0: String(recordCount) })}`}
        style={{ top: HEADER_HEIGHT + index * ROW_HEIGHT, height: ROW_HEIGHT }}
        onClick={() => activate(row)}
        className={cn(
          GRID,
          'absolute inset-x-0 cursor-pointer items-center gap-2 px-2 text-xs text-text-primary hover:bg-surface-hover',
          row.type === 'turn'
            ? 'border-t border-border-light bg-surface-primary-alt font-semibold'
            : 'font-medium',
          active && ACTIVE_RING,
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: indent }}>
          {chevron(row.expanded)}
          <span className="shrink-0 truncate">{label}</span>
          <span className="min-w-0 truncate font-normal text-text-secondary">{description}</span>
          {errorCount > 0 && (
            <CircleAlert aria-hidden="true" className="size-3.5 shrink-0 text-status-error" />
          )}
        </span>
        <span className="text-right font-normal tabular-nums text-text-secondary">
          {format.duration(
            row.type === 'turn' ? row.turn.end - row.turn.start : row.step.end - row.step.start,
          )}
        </span>
        <span className="hidden md:block" />
        <span className="relative h-full overflow-hidden">
          <GroupBar span={span} domain={domainFor(messageId)} />
        </span>
      </div>
    );
  };

  const renderRow = (row: TraceRow, index: number) => {
    if (row.type === 'turn') {
      const { turn } = row;
      return renderGroupRow(row, index, {
        label: localize('com_ui_trace_turn', { 0: format.clock(turn.start) }),
        description: turnSummary(turn),
        errorCount: turn.errorCount,
        recordCount: turn.recordCount,
        span: turnSpan(turn, scale),
        messageId: turn.messageId,
        indent: 0,
      });
    }
    if (row.type === 'step') {
      const { step } = row;
      return renderGroupRow(row, index, {
        label:
          step.origin === 'title'
            ? localize('com_ui_trace_title_step')
            : localize('com_ui_trace_step', { 0: String(step.index) }),
        description: stepDescription(step),
        errorCount: step.errorCount,
        recordCount: step.recordCount,
        span: stepSpan(step, scale),
        messageId: step.messageId,
        indent: INDENT_PX,
      });
    }

    const { node } = row;
    const { record } = node;
    const active = activeRow?.key === row.key;
    const turnStart = model.turns.find((turn) => turn.messageId === record.messageId)?.start;
    const appearance = KIND_APPEARANCE[record.kind];
    const Icon = appearance.icon;
    const running = record.status === 'running';
    const duration = recordDurationText(node, format, localize(STATUS_LABEL.running));
    const statusText =
      record.status === 'error' || record.status === 'warning'
        ? `${duration}, ${localize(STATUS_LABEL[record.status])}`
        : duration;
    const preview = previewFor(node);
    const name = preview != null ? `${record.name}: ${preview}` : record.name;

    return (
      <div
        key={row.key}
        id={rowId(row.key)}
        role="treeitem"
        aria-posinset={row.position}
        aria-setsize={row.setSize}
        aria-level={row.level}
        aria-expanded={row.hasChildren ? row.expanded : undefined}
        aria-selected={selectedId === row.key}
        aria-label={localize('com_ui_trace_bar_description', {
          0: `${name}, ${localize(appearance.label)}`,
          1: format.duration(node.start - (turnStart ?? model.start)),
          2: statusText,
        })}
        style={{ top: HEADER_HEIGHT + index * ROW_HEIGHT, height: ROW_HEIGHT }}
        onClick={() => activate(row)}
        className={cn(
          GRID,
          'text-text-primary hover:bg-surface-hover absolute inset-x-0 cursor-pointer items-center gap-2 px-2 text-sm',
          selectedId === row.key && 'bg-surface-active-alt',
          active && ACTIVE_RING,
        )}
      >
        <span
          className="flex min-w-0 items-center gap-1.5"
          style={{ paddingLeft: (row.level - 2) * INDENT_PX }}
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
            {row.hasChildren && chevron(row.expanded)}
          </span>
          <Icon aria-hidden="true" className="size-3.5 shrink-0 text-text-secondary" />
          <span className="min-w-[3ch] max-w-[60%] truncate">{record.name}</span>
          {preview != null && (
            <span
              className="min-w-[4ch] flex-1 truncate text-xs text-text-secondary"
              title={preview}
            >
              {preview}
            </span>
          )}
          {record.model != null && (
            <span className="text-text-secondary hidden min-w-0 shrink-[4] truncate text-xs sm:inline">
              {record.model}
            </span>
          )}
          {record.status === 'error' && (
            <CircleAlert aria-hidden="true" className="text-status-error size-3.5 shrink-0" />
          )}
          {running && (
            <CircleDashed aria-hidden="true" className="text-text-secondary size-3.5 shrink-0" />
          )}
        </span>
        <span className="text-text-secondary truncate text-right text-xs tabular-nums">
          {duration}
        </span>
        <span className="text-text-secondary hidden text-right text-xs tabular-nums md:block">
          {recordTokens(node)}
        </span>
        <span className="relative h-full overflow-hidden">
          <RecordBar node={node} scale={scale} domain={domainFor(record.messageId)} />
        </span>
      </div>
    );
  };

  const visibleRows: JSX.Element[] = [];
  for (let index = first; index <= last && index < rows.length; index++) {
    visibleRows.push(renderRow(rows[index], index));
  }
  if (activeRow && (activeIndex < first || activeIndex > last)) {
    visibleRows.push(renderRow(activeRow, activeIndex));
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
      className="group/tree relative min-h-0 flex-1 overflow-auto focus-visible:outline-hidden"
    >
      <div
        aria-hidden="true"
        className={cn(
          GRID,
          'border-border-light bg-presentation text-text-secondary sticky top-0 z-10 h-7 items-center gap-2 border-b px-2 text-[11px] font-medium tracking-wide uppercase',
        )}
      >
        <span>{localize('com_ui_trace_column_name')}</span>
        <span className="text-right">{localize('com_ui_trace_column_duration')}</span>
        <span className="hidden text-right md:block">{localize('com_ui_trace_column_tokens')}</span>
        {viewDomain ? (
          <span className="flex justify-between normal-case tabular-nums tracking-normal">
            <span>{position(viewDomain.start)}</span>
            <span>{position(viewDomain.start + viewDomain.span)}</span>
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
