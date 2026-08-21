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

const uniqueToolActivityId = (rawId: string, used: Set<string>): string => {
  const base = truncateUtf8(rawId, MAX_TOOL_CALL_ID_BYTES).value || 'tool';
  let candidate = base;
  let occurrence = 2;
  while (used.has(candidate)) {
    const suffix = `#${occurrence}`;
    const prefix = truncateUtf8(base, MAX_TOOL_CALL_ID_BYTES - Buffer.byteLength(suffix)).value;
    candidate = `${prefix}${suffix}`;
    occurrence += 1;
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

  const activity: SubagentActivityItem[] = [];
  const toolsByRawId = new Map<string, MutableToolActivity[]>();
  const usedToolActivityIds = new Set<string>();
  let truncated = false;
  const append = (item: SubagentActivityItem) => {
    activity.push(item);
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
        );
        append(normalized.item);
        const occurrences = toolsByRawId.get(normalized.rawId) ?? [];
        occurrences.push(normalized.item);
        toolsByRawId.set(normalized.rawId, occurrences);
      });
      continue;
    }
    if (stored.type !== 'tool') continue;
    const toolCallId = typeof data.tool_call_id === 'string' ? data.tool_call_id : '';
    const output = truncateUtf8(visibleContent(data.content).text, MAX_TOOL_OUTPUT_BYTES);
    const existing = toolsByRawId
      .get(toolCallId)
      ?.find((candidate) => candidate.status === 'running');
    if (existing != null) {
      existing.status = toolResultStatus(data.status);
      if (output.value !== '') existing.output = output.value;
      if (output.truncated) existing.outputTruncated = true;
      continue;
    }
    const name = typeof data.name === 'string' && data.name !== '' ? data.name : 'tool';
    const projectedToolCallId = uniqueToolActivityId(
      toolCallId || `tool-result-${activity.length}`,
      usedToolActivityIds,
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
    if (toolCallId !== '') {
      const occurrences = toolsByRawId.get(toolCallId) ?? [];
      occurrences.push(orphan);
      toolsByRawId.set(toolCallId, occurrences);
    }
  }

  if (activity.length > MAX_ACTIVITY_ITEMS) {
    activity.splice(0, activity.length - MAX_ACTIVITY_ITEMS);
    truncated = true;
  }
  while (Buffer.byteLength(JSON.stringify(activity), 'utf8') > MAX_ACTIVITY_BYTES) {
    activity.shift();
    truncated = true;
  }
  return { activity, truncated };
}

export const SUBAGENT_ACTIVITY_LIMITS = {
  items: MAX_ACTIVITY_ITEMS,
  bytes: MAX_ACTIVITY_BYTES,
  textBytes: MAX_ACTIVITY_TEXT_BYTES,
  toolInputBytes: MAX_TOOL_INPUT_BYTES,
  toolOutputBytes: MAX_TOOL_OUTPUT_BYTES,
} as const;
