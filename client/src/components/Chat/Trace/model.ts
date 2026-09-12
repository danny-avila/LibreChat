import type { TTraceRecord } from 'librechat-data-provider';

export type TraceNode = {
  record: TTraceRecord;
  start: number;
  /** Absent while the record is still running: it has a start, not a duration. */
  end?: number;
  /** First streamed token, clamped inside the record's own span. */
  firstToken?: number;
  depth: number;
  parentId: string | null;
  childIds: string[];
};

export type TraceTurn = {
  key: string;
  messageId: string;
  start: number;
  end: number;
  rootIds: string[];
  recordCount: number;
  errorCount: number;
};

export type TraceSummary = {
  duration: number;
  turns: number;
  generations: number;
  toolCalls: number;
  errors: number;
  running: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost?: number;
};

export type TraceModel = {
  nodes: Map<string, TraceNode>;
  turns: TraceTurn[];
  start: number;
  end: number;
  summary: TraceSummary;
};

export type TraceWindow = { start: number; end: number };

/** `position` and `setSize` count the row's visible siblings, as a tree item's ARIA position does. */
type RowPlacement = { key: string; expanded: boolean; position: number; setSize: number };

export type TraceRow =
  | (RowPlacement & { type: 'turn'; turn: TraceTurn })
  | (RowPlacement & { type: 'record'; node: TraceNode; hasChildren: boolean });

export type TraceFilter = {
  collapsed: ReadonlySet<string>;
  query: string;
  window: TraceWindow | null;
};

const EMPTY_SUMMARY: TraceSummary = {
  duration: 0,
  turns: 0,
  generations: 0,
  toolCalls: 0,
  errors: 0,
  running: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
};

export const turnKey = (messageId: string): string => `turn:${messageId}`;

const byStart = (nodes: Map<string, TraceNode>) => (a: string, b: string) => {
  const left = nodes.get(a);
  const right = nodes.get(b);
  return (left?.start ?? 0) - (right?.start ?? 0) || a.localeCompare(b);
};

function toNode(record: TTraceRecord): TraceNode | null {
  const start = Date.parse(record.startTime);
  if (!Number.isFinite(start)) {
    return null;
  }
  const parsedEnd = record.endTime != null ? Date.parse(record.endTime) : Number.NaN;
  const end = Number.isFinite(parsedEnd) ? Math.max(parsedEnd, start) : undefined;
  const parsedToken =
    record.completionStartTime != null ? Date.parse(record.completionStartTime) : Number.NaN;
  const firstToken = Number.isFinite(parsedToken)
    ? Math.min(Math.max(parsedToken, start), end ?? parsedToken)
    : undefined;
  return { record, start, end, firstToken, depth: 0, parentId: null, childIds: [] };
}

/**
 * Cuts every parent cycle so each record hangs from exactly one root. A record
 * whose parent is unloaded, belongs to another turn, or closes a loop becomes a
 * root of its own turn instead of disappearing.
 */
function resolveParents(nodes: Map<string, TraceNode>): void {
  for (const [id, node] of nodes) {
    const parentId = node.record.parentId;
    const parent = parentId != null ? nodes.get(parentId) : undefined;
    node.parentId =
      parent != null && parentId !== id && parent.record.messageId === node.record.messageId
        ? parentId
        : null;
  }

  const settled = new Set<string>();
  for (const id of nodes.keys()) {
    const path = new Set<string>();
    let current: string | null = id;
    let previous: string | null = null;
    while (current != null && !settled.has(current)) {
      if (path.has(current)) {
        const cutAt = nodes.get(previous ?? current);
        if (cutAt) {
          cutAt.parentId = null;
        }
        break;
      }
      path.add(current);
      previous = current;
      current = nodes.get(current)?.parentId ?? null;
    }
    for (const visited of path) {
      settled.add(visited);
    }
  }
}

/** Projects a flat, possibly partial record list into turns of record trees. */
export function buildTraceModel(records: readonly TTraceRecord[]): TraceModel {
  const nodes = new Map<string, TraceNode>();
  for (const record of records) {
    const node = toNode(record);
    if (node) {
      nodes.set(record.id, node);
    }
  }
  if (nodes.size === 0) {
    return { nodes, turns: [], start: 0, end: 0, summary: EMPTY_SUMMARY };
  }

  resolveParents(nodes);

  const turnsByMessage = new Map<string, TraceTurn>();
  const summary: TraceSummary = { ...EMPTY_SUMMARY };
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  let cost = 0;
  let pricedRecords = 0;
  let unpricedRecords = 0;

  for (const [id, node] of nodes) {
    const { record } = node;
    const nodeEnd = node.end ?? node.start;
    start = Math.min(start, node.start);
    end = Math.max(end, nodeEnd);

    if (node.parentId != null) {
      nodes.get(node.parentId)?.childIds.push(id);
    }

    const key = turnKey(record.messageId);
    let turn = turnsByMessage.get(record.messageId);
    if (!turn) {
      turn = {
        key,
        messageId: record.messageId,
        start: node.start,
        end: nodeEnd,
        rootIds: [],
        recordCount: 0,
        errorCount: 0,
      };
      turnsByMessage.set(record.messageId, turn);
    }
    turn.start = Math.min(turn.start, node.start);
    turn.end = Math.max(turn.end, nodeEnd);
    turn.recordCount++;
    if (node.parentId == null) {
      turn.rootIds.push(id);
    }

    if (record.status === 'error') {
      turn.errorCount++;
      summary.errors++;
    } else if (record.status === 'running') {
      summary.running++;
    }
    if (record.kind === 'tool') {
      summary.toolCalls++;
    }
    if (record.kind === 'generation') {
      summary.generations++;
      const input = record.usage?.input ?? 0;
      const output = record.usage?.output ?? 0;
      const total = record.usage?.total ?? input + output;
      summary.inputTokens += input;
      summary.outputTokens += output;
      summary.totalTokens += total;
      if (record.cost == null && total > 0) {
        unpricedRecords++;
      }
    }
    if (record.cost != null) {
      pricedRecords++;
      cost += record.cost;
    }
  }

  const compare = byStart(nodes);
  const turns = [...turnsByMessage.values()].sort((a, b) => a.start - b.start);
  for (const turn of turns) {
    turn.rootIds.sort(compare);
    const stack = turn.rootIds.map((id) => ({ id, depth: 0 }));
    while (stack.length > 0) {
      const entry = stack.pop();
      const node = entry ? nodes.get(entry.id) : undefined;
      if (!entry || !node) {
        continue;
      }
      node.depth = entry.depth;
      node.childIds.sort(compare);
      for (const childId of node.childIds) {
        stack.push({ id: childId, depth: entry.depth + 1 });
      }
    }
  }

  summary.turns = turns.length;
  summary.duration = end - start;
  /** A total that silently skips unpriced model calls would under-report spend, so there is none. */
  if (pricedRecords > 0 && unpricedRecords === 0) {
    summary.cost = cost;
  }
  return { nodes, turns, start, end, summary };
}

function matchesQuery(node: TraceNode, query: string): boolean {
  if (!query) {
    return true;
  }
  const { name, model, kind, statusMessage } = node.record;
  return [name, model, kind, statusMessage].some(
    (value) => value != null && value.toLowerCase().includes(query),
  );
}

function overlapsWindow(node: TraceNode, window: TraceWindow | null): boolean {
  return window == null || (node.start <= window.end && (node.end ?? node.start) >= window.start);
}

/** Records that match the filter, plus every ancestor so a match keeps its context. */
function visibleIds(model: TraceModel, query: string, window: TraceWindow | null): Set<string> {
  const visible = new Set<string>();
  for (const [id, node] of model.nodes) {
    if (!matchesQuery(node, query) || !overlapsWindow(node, window)) {
      continue;
    }
    let current: string | null = id;
    while (current != null && !visible.has(current)) {
      visible.add(current);
      current = model.nodes.get(current)?.parentId ?? null;
    }
  }
  return visible;
}

/**
 * The ledger's rows in display order. A search or interval selection expands
 * everything it keeps, so a match is never hidden inside a folded parent.
 */
export function flattenRows(
  model: TraceModel,
  { collapsed, query, window }: TraceFilter,
): TraceRow[] {
  const normalizedQuery = query.trim().toLowerCase();
  const filtering = normalizedQuery !== '' || window != null;
  const visible = filtering ? visibleIds(model, normalizedQuery, window) : null;
  const rows: TraceRow[] = [];

  const turns = model.turns.flatMap((turn) => {
    const roots = visible ? turn.rootIds.filter((id) => visible.has(id)) : turn.rootIds;
    return visible && roots.length === 0 ? [] : [{ turn, roots }];
  });

  turns.forEach(({ turn, roots }, turnIndex) => {
    const turnExpanded = filtering || !collapsed.has(turn.key);
    rows.push({
      type: 'turn',
      key: turn.key,
      turn,
      expanded: turnExpanded,
      position: turnIndex + 1,
      setSize: turns.length,
    });
    if (!turnExpanded) {
      return;
    }

    const stack = roots
      .map((id, index) => ({ id, position: index + 1, setSize: roots.length }))
      .reverse();
    while (stack.length > 0) {
      const entry = stack.pop();
      const node = entry != null ? model.nodes.get(entry.id) : undefined;
      if (entry == null || !node) {
        continue;
      }
      const children = visible
        ? node.childIds.filter((childId) => visible.has(childId))
        : node.childIds;
      const expanded = filtering || !collapsed.has(entry.id);
      rows.push({
        type: 'record',
        key: entry.id,
        node,
        expanded,
        hasChildren: children.length > 0,
        position: entry.position,
        setSize: entry.setSize,
      });
      if (!expanded) {
        continue;
      }
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push({ id: children[i], position: i + 1, setSize: children.length });
      }
    }
  });
  return rows;
}

/** Ids a user can fold: every turn and every record with children. */
export function collapsibleKeys(model: TraceModel): string[] {
  const keys = model.turns.map((turn) => turn.key);
  for (const [id, node] of model.nodes) {
    if (node.childIds.length > 0) {
      keys.push(id);
    }
  }
  return keys;
}

/**
 * Packs records into a fixed number of overview lanes the way a network
 * waterfall does: each record takes the first lane free at its start.
 */
export function assignLanes(model: TraceModel, laneCount: number): Map<string, number> {
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();
  const ordered = [...model.nodes.values()].sort((a, b) => a.start - b.start || a.depth - b.depth);
  for (const node of ordered) {
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= node.start);
    if (lane === -1) {
      lane = laneEnds.length < laneCount ? laneEnds.length : laneCount - 1;
    }
    laneEnds[lane] = Math.max(laneEnds[lane] ?? 0, node.end ?? node.start);
    lanes.set(node.record.id, lane);
  }
  return lanes;
}

/** Clamps a zoom window inside the trace and keeps it at least `minSpan` wide. */
export function clampWindow(
  window: TraceWindow,
  bounds: TraceWindow,
  minSpan = 1,
): TraceWindow | null {
  const total = bounds.end - bounds.start;
  if (total <= 0) {
    return null;
  }
  const span = Math.min(Math.max(window.end - window.start, minSpan), total);
  if (span >= total) {
    return null;
  }
  const start = Math.min(Math.max(window.start, bounds.start), bounds.end - span);
  return { start, end: start + span };
}

export const ZOOM_STEP = 0.5;
const PAN_STEP = 0.1;

/** Rescales `view` by `factor` around `anchor`, an absolute timestamp. */
export function zoomWindow(
  model: Pick<TraceModel, 'start' | 'end'>,
  view: TraceWindow | null,
  factor: number,
  anchor?: number,
): TraceWindow | null {
  const bounds = { start: model.start, end: model.end };
  const current = view ?? bounds;
  const pivot = anchor ?? (current.start + current.end) / 2;
  const start = pivot - (pivot - current.start) * factor;
  const end = pivot + (current.end - pivot) * factor;
  return clampWindow({ start, end }, bounds, minimumSpan(model));
}

export function panWindow(
  model: Pick<TraceModel, 'start' | 'end'>,
  view: TraceWindow | null,
  direction: -1 | 1,
): TraceWindow | null {
  if (!view) {
    return null;
  }
  const shift = (view.end - view.start) * PAN_STEP * direction;
  return clampWindow(
    { start: view.start + shift, end: view.end + shift },
    { start: model.start, end: model.end },
    minimumSpan(model),
  );
}

export function minimumSpan(model: Pick<TraceModel, 'start' | 'end'>): number {
  return Math.max((model.end - model.start) / 1000, 1);
}

const millisecondFormat = new Intl.NumberFormat(undefined, {
  style: 'unit',
  unit: 'millisecond',
  unitDisplay: 'narrow',
  maximumFractionDigits: 0,
});
const secondFormat = new Intl.NumberFormat(undefined, {
  style: 'unit',
  unit: 'second',
  unitDisplay: 'narrow',
  maximumFractionDigits: 2,
});
const wholeSecondFormat = new Intl.NumberFormat(undefined, {
  style: 'unit',
  unit: 'second',
  unitDisplay: 'narrow',
  maximumFractionDigits: 0,
});
const minuteFormat = new Intl.NumberFormat(undefined, {
  style: 'unit',
  unit: 'minute',
  unitDisplay: 'narrow',
  maximumFractionDigits: 0,
});
const hourFormat = new Intl.NumberFormat(undefined, {
  style: 'unit',
  unit: 'hour',
  unitDisplay: 'narrow',
  maximumFractionDigits: 0,
});

export function formatDuration(ms: number): string {
  const value = Number.isFinite(ms) && ms > 0 ? ms : 0;
  if (value < 1000) {
    return millisecondFormat.format(value);
  }
  if (value < 60_000) {
    return secondFormat.format(value / 1000);
  }
  if (value < 3_600_000) {
    const minutes = Math.floor(value / 60_000);
    const seconds = Math.floor((value % 60_000) / 1000);
    return `${minuteFormat.format(minutes)} ${wholeSecondFormat.format(seconds)}`;
  }
  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.floor((value % 3_600_000) / 60_000);
  return `${hourFormat.format(hours)} ${minuteFormat.format(minutes)}`;
}

const clockFormat = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
});

export function formatClock(epochMs: number): string {
  return clockFormat.format(epochMs);
}
