import type { SubagentActivityItem } from 'librechat-data-provider';

const MAX_ACTIVITY_ITEMS = 100;
const MAX_ACTIVITY_BYTES = 64 * 1024;
const MAX_ACTIVITY_TEXT_BYTES = 32 * 1024;
const MAX_TOOL_INPUT_BYTES = 8 * 1024;
const MAX_TOOL_OUTPUT_BYTES = 16 * 1024;
const MAX_TOOL_NAME_BYTES = 512;
const MAX_TOOL_CALL_ID_BYTES = 512;

type Projection = {
  activity: SubagentActivityItem[];
  truncated: boolean;
};

type MutableToolActivity = Extract<SubagentActivityItem, { type: 'tool' }>;
type ProjectedActivityEntry = { item: SubagentActivityItem; active: boolean };
type MutableToolProjection = {
  item: MutableToolActivity;
  entry: ProjectedActivityEntry;
};
type MutableToolQueue = {
  items: MutableToolProjection[];
  nextPending: number;
};

const toolResultStatus = (value: unknown): MutableToolActivity['status'] => {
  if (value === 'error' || value === 'failed') return 'failed';
  if (value === 'cancelled') return 'cancelled';
  return 'completed';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value);

const truncateUtf8 = (input: string, byteLimit: number) => {
  if (Buffer.byteLength(input, 'utf8') <= byteLimit) {
    return { value: input, truncated: false };
  }
  let low = 0;
  let high = input.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(input.slice(0, middle), 'utf8') <= byteLimit) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  let end = low;
  if (end > 0 && /[\uD800-\uDBFF]/.test(input[end - 1])) end -= 1;
  return { value: input.slice(0, end), truncated: true };
};

const safeJson = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
};

const serializedBytes = (value: unknown): number =>
  Buffer.byteLength(JSON.stringify(value), 'utf8');

const shrinkStringField = <T extends SubagentActivityItem>(
  item: T,
  field: keyof T,
  truncatedField?: keyof T,
): T => {
  const current = item[field];
  if (typeof current !== 'string') return item;
  const base = {
    ...item,
    [field]: '',
    ...(truncatedField == null ? {} : { [truncatedField]: true }),
  } as T;
  if (serializedBytes([base]) > MAX_ACTIVITY_BYTES) return base;
  let low = 0;
  let high = current.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = { ...base, [field]: current.slice(0, middle) } as T;
    if (serializedBytes([candidate]) <= MAX_ACTIVITY_BYTES) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return { ...base, [field]: current.slice(0, low) } as T;
};

const fitNewestItemToSerializedBudget = (item: SubagentActivityItem): SubagentActivityItem => {
  if (serializedBytes([item]) <= MAX_ACTIVITY_BYTES) return item;
  if (item.type === 'writing') return shrinkStringField(item, 'text', 'textTruncated');
  if (item.type === 'reasoning') return item;

  // Preserve the terminal output as long as possible: discard oversized input
  // first, then trim output and finally public identity fields if a provider
  // supplied escape-heavy strings.
  let tool = shrinkStringField(item, 'input', 'inputTruncated');
  if (serializedBytes([tool]) <= MAX_ACTIVITY_BYTES) return tool;
  tool = shrinkStringField(tool, 'output', 'outputTruncated');
  if (serializedBytes([tool]) <= MAX_ACTIVITY_BYTES) return tool;
  tool = shrinkStringField(tool, 'name');
  if (serializedBytes([tool]) <= MAX_ACTIVITY_BYTES) return tool;
  return shrinkStringField(tool, 'toolCallId');
};

const visibleContent = (value: unknown): { text: string; hasReasoning: boolean } => {
  if (typeof value === 'string') return { text: value, hasReasoning: false };
  if (!Array.isArray(value)) return { text: '', hasReasoning: false };
  const text: string[] = [];
  let hasReasoning = false;
  for (const block of value) {
    if (!isRecord(block) || typeof block.type !== 'string') continue;
    if ((block.type === 'text' || block.type === 'text-plain') && typeof block.text === 'string') {
      text.push(block.text);
    } else if (block.type === 'reasoning' || block.type === 'thinking') {
      // Preserve the user-visible lifecycle marker, never the model's hidden reasoning payload.
      hasReasoning = true;
    }
  }
  return { text: text.join(''), hasReasoning };
};

const readToolCalls = (data: Record<string, unknown>): unknown[] => {
  if (Array.isArray(data.tool_calls)) return data.tool_calls;
  const additional = isRecord(data.additional_kwargs) ? data.additional_kwargs : undefined;
  return Array.isArray(additional?.tool_calls) ? additional.tool_calls : [];
};

const normalizeToolCall = (
  value: unknown,
  index: number,
): { rawId: string; item: MutableToolActivity } | undefined => {
  if (!isRecord(value)) return undefined;
  const fn = isRecord(value.function) ? value.function : undefined;
  const rawName = typeof value.name === 'string' ? value.name : fn?.name;
  if (typeof rawName !== 'string' || rawName.trim() === '') return undefined;
  const rawId = typeof value.id === 'string' && value.id !== '' ? value.id : `tool-${index}`;
  const rawInput = value.args ?? fn?.arguments;
  const input = truncateUtf8(safeJson(rawInput), MAX_TOOL_INPUT_BYTES);
  return {
    rawId,
    item: {
      type: 'tool',
      toolCallId: truncateUtf8(rawId, MAX_TOOL_CALL_ID_BYTES).value,
      name: truncateUtf8(rawName, MAX_TOOL_NAME_BYTES).value,
      ...(input.value === '' ? {} : { input: input.value }),
      ...(input.truncated ? { inputTruncated: true } : {}),
      status: 'running',
    },
  };
};

const uniqueToolActivityId = (
  rawId: string,
  used: Set<string>,
  nextGeneratedOccurrence: { value: number },
): string => {
  const base = truncateUtf8(rawId, MAX_TOOL_CALL_ID_BYTES).value || 'tool';
  let candidate = base;
  while (used.has(candidate)) {
    const suffix = `#${nextGeneratedOccurrence.value}`;
    nextGeneratedOccurrence.value += 1;
    const prefix = truncateUtf8(base, MAX_TOOL_CALL_ID_BYTES - Buffer.byteLength(suffix)).value;
    candidate = `${prefix}${suffix}`;
  }
  used.add(candidate);
  return candidate;
};

/**
 * Converts one server-private LangChain transcript into a bounded public
 * activity projection. Only visible text and declared tool calls/results are
 * retained; response metadata, artifacts, runtime fields, and reasoning text
 * are intentionally ignored.
 */
export function projectSubagentActivity(
  messagesJson: string | undefined,
  mode: 'append' | 'replace' = 'append',
  expectedTaskInput?: string,
): Projection {
  if (messagesJson == null) return { activity: [], truncated: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(messagesJson) as unknown;
  } catch {
    return { activity: [], truncated: true };
  }
  if (!Array.isArray(parsed)) return { activity: [], truncated: true };
  let relevantMessages = parsed;
  if (mode === 'replace') {
    if (expectedTaskInput == null) return { activity: [], truncated: true };
    let latestInputIndex = -1;
    for (let index = parsed.length - 1; index >= 0; index -= 1) {
      const stored = parsed[index];
      if (isRecord(stored) && (stored.type === 'human' || stored.type === 'user')) {
        latestInputIndex = index;
        break;
      }
    }
    // A replacement transcript can contain the complete child history. If
    // its current input boundary is missing, fail closed instead of exposing
    // activity from earlier invocations on the selected parent card.
    if (
      latestInputIndex < 0 ||
      !isRecord(parsed[latestInputIndex]) ||
      !isRecord(parsed[latestInputIndex].data) ||
      visibleContent(parsed[latestInputIndex].data.content).text !== expectedTaskInput
    ) {
      return { activity: [], truncated: true };
    }
    relevantMessages = parsed.slice(latestInputIndex + 1);
  }

  const activity: ProjectedActivityEntry[] = [];
  const toolsByRawId = new Map<string, MutableToolQueue>();
  const usedToolActivityIds = new Set<string>();
  // A global cursor makes collision probing amortized linear even when many
  // maximum-length provider IDs collapse to the same suffixed prefix.
  const nextGeneratedToolOccurrence = { value: 2 };
  let truncated = false;
  const append = (item: SubagentActivityItem) => {
    const entry = { item, active: true };
    activity.push(entry);
    return entry;
  };

  for (const stored of relevantMessages) {
    if (!isRecord(stored) || !isRecord(stored.data) || typeof stored.type !== 'string') {
      truncated = true;
      continue;
    }
    const { data } = stored;
    if (stored.type === 'ai' || stored.type === 'assistant') {
      const content = visibleContent(data.content);
      if (content.hasReasoning) append({ type: 'reasoning' });
      if (content.text !== '') {
        const text = truncateUtf8(content.text, MAX_ACTIVITY_TEXT_BYTES);
        append({
          type: 'writing',
          text: text.value,
          ...(text.truncated ? { textTruncated: true } : {}),
        });
      }
      readToolCalls(data).forEach((call, index) => {
        const normalized = normalizeToolCall(call, index);
        if (normalized == null) return;
        normalized.item.toolCallId = uniqueToolActivityId(
          normalized.item.toolCallId,
          usedToolActivityIds,
          nextGeneratedToolOccurrence,
        );
        const entry = append(normalized.item);
        const queue = toolsByRawId.get(normalized.rawId) ?? { items: [], nextPending: 0 };
        queue.items.push({ item: normalized.item, entry });
        toolsByRawId.set(normalized.rawId, queue);
      });
      continue;
    }
    if (stored.type !== 'tool') continue;
    const toolCallId = typeof data.tool_call_id === 'string' ? data.tool_call_id : '';
    const output = truncateUtf8(visibleContent(data.content).text, MAX_TOOL_OUTPUT_BYTES);
    const queue = toolsByRawId.get(toolCallId);
    const existing = queue?.items[queue.nextPending];
    if (queue != null && existing != null) {
      queue.nextPending += 1;
      existing.item.status = toolResultStatus(data.status);
      if (output.value !== '') existing.item.output = output.value;
      if (output.truncated) existing.item.outputTruncated = true;
      existing.entry.active = false;
      existing.entry = append(existing.item);
      continue;
    }
    const name = typeof data.name === 'string' && data.name !== '' ? data.name : 'tool';
    const projectedToolCallId = uniqueToolActivityId(
      toolCallId || `tool-result-${activity.length}`,
      usedToolActivityIds,
      nextGeneratedToolOccurrence,
    );
    const orphan: MutableToolActivity = {
      type: 'tool',
      toolCallId: projectedToolCallId,
      name: truncateUtf8(name, MAX_TOOL_NAME_BYTES).value,
      ...(output.value === '' ? {} : { output: output.value }),
      ...(output.truncated ? { outputTruncated: true } : {}),
      status: toolResultStatus(data.status),
    };
    append(orphan);
  }

  let boundedActivity = activity.filter((entry) => entry.active).map((entry) => entry.item);
  if (boundedActivity.length > MAX_ACTIVITY_ITEMS) {
    boundedActivity = boundedActivity.slice(-MAX_ACTIVITY_ITEMS);
    truncated = true;
  }
  while (boundedActivity.length > 1 && serializedBytes(boundedActivity) > MAX_ACTIVITY_BYTES) {
    boundedActivity.shift();
    truncated = true;
  }
  if (boundedActivity.length === 1 && serializedBytes(boundedActivity) > MAX_ACTIVITY_BYTES) {
    boundedActivity[0] = fitNewestItemToSerializedBudget(boundedActivity[0]);
    truncated = true;
  }
  return { activity: boundedActivity, truncated };
}

export const SUBAGENT_ACTIVITY_LIMITS = {
  items: MAX_ACTIVITY_ITEMS,
  bytes: MAX_ACTIVITY_BYTES,
  textBytes: MAX_ACTIVITY_TEXT_BYTES,
  toolInputBytes: MAX_TOOL_INPUT_BYTES,
  toolOutputBytes: MAX_TOOL_OUTPUT_BYTES,
} as const;
