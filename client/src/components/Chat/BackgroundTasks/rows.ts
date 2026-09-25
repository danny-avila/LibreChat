import { ContentTypes } from 'librechat-data-provider';
import type {
  TMessage,
  BackgroundTaskSummary,
  ParentSubagentSummary,
  SubagentThreadStatus,
} from 'librechat-data-provider';

export type TaskRowStatus = 'running' | 'stopping' | 'completed' | 'error' | 'cancelled';

export type TaskRow = {
  id: string;
  kind: 'tool' | 'subagent';
  /** Tool id for tool rows, thread title for subagent rows. */
  name: string;
  /** The call's model-authored intent, when its tool call is in the loaded messages. */
  title?: string;
  /** The command or code the call ran, for the expanded card. */
  detail?: string;
  /** Tool cancel target. */
  taskId?: string;
  status: TaskRowStatus;
  startedAt?: number;
  settledAt?: number;
  /** Subagent cancel target; present only while the child can still be stopped. */
  subagent?: { threadId: string; taskId: string };
};

/** Matches the server registry's settled-task retention, so both kinds age out together. */
export const RECENT_SUBAGENT_WINDOW_MS = 60 * 60 * 1000;

const time = (value?: string): number | undefined => {
  if (value == null) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const subagentStatus = (status: SubagentThreadStatus): TaskRowStatus => {
  if (status === 'running' || status === 'dispatched') return 'running';
  if (status === 'failed' || status === 'interrupted') return 'error';
  return status;
};

export type ToolCallArgs = string | Record<string, unknown> | undefined;

/** Resolve a tool call within its dispatch message; a legacy task without a
 * message id can still use the newest matching call as a best-effort fallback. */
const toolCallKey = (messageId: string | undefined, toolCallId: string): string =>
  `${messageId ?? ''}\u0000${toolCallId}`;

export function findToolCallArgs(
  messages: readonly TMessage[] | undefined,
  tasks: readonly Pick<BackgroundTaskSummary, 'messageId' | 'toolCallId'>[],
): Map<string, ToolCallArgs> {
  const found = new Map<string, ToolCallArgs>();
  if (messages == null || tasks.length === 0) return found;
  const wanted = new Set(tasks.map((task) => toolCallKey(task.messageId, task.toolCallId)));
  for (let i = messages.length - 1; i >= 0 && found.size < wanted.size; i--) {
    const message = messages[i];
    for (const part of message.content ?? []) {
      if (part?.type !== ContentTypes.TOOL_CALL) continue;
      const call = part[ContentTypes.TOOL_CALL] as { id?: string; args?: ToolCallArgs } | undefined;
      if (call?.id == null) continue;
      const key = toolCallKey(message.messageId, call.id);
      if (wanted.has(key) && !found.has(key)) found.set(key, call.args);
      const fallback = toolCallKey(undefined, call.id);
      if (wanted.has(fallback) && !found.has(fallback)) found.set(fallback, call.args);
    }
  }
  return found;
}

export type ToolCallDescriber = (args: ToolCallArgs) => Pick<TaskRow, 'title' | 'detail'>;

const toolRow = (
  task: BackgroundTaskSummary,
  described: Pick<TaskRow, 'title' | 'detail'>,
): TaskRow => ({
  id: `tool:${task.taskId}`,
  kind: 'tool',
  name: task.toolName,
  taskId: task.taskId,
  ...described,
  status: task.status === 'running' && task.cancellationRequested ? 'stopping' : task.status,
  startedAt: time(task.startedAt),
  settledAt: time(task.settledAt),
});

const subagentRow = (child: ParentSubagentSummary, stopping: ReadonlySet<string>): TaskRow => {
  const status = subagentStatus(child.status);
  const running = status === 'running';
  const taskId = child.latestTaskId;
  return {
    id: `subagent:${child.threadId}`,
    kind: 'subagent',
    name: child.title,
    status: running && stopping.has(child.threadId) ? 'stopping' : status,
    startedAt: time(child.tasks[0]?.createdAt),
    settledAt: running ? undefined : time(child.updatedAt),
    ...(running && taskId != null ? { subagent: { threadId: child.threadId, taskId } } : {}),
  };
};

const isActive = (row: TaskRow) => row.status === 'running' || row.status === 'stopping';

/**
 * One list across both background kinds: active rows first, then the most
 * recently started. Settled subagents older than the registry's retention are
 * dropped so a long conversation does not list its whole history.
 */
export function buildTaskRows({
  tools,
  subagents,
  stoppingThreads,
  now,
  describe,
  args,
}: {
  describe: ToolCallDescriber;
  args: ReadonlyMap<string, ToolCallArgs>;
  tools: readonly BackgroundTaskSummary[];
  subagents: readonly ParentSubagentSummary[];
  stoppingThreads: ReadonlySet<string>;
  now: number;
}): TaskRow[] {
  const rows = tools.map((task) =>
    toolRow(task, describe(args.get(toolCallKey(task.messageId, task.toolCallId)))),
  );
  for (const child of subagents) {
    const row = subagentRow(child, stoppingThreads);
    const recent = row.settledAt == null || now - row.settledAt <= RECENT_SUBAGENT_WINDOW_MS;
    if (isActive(row) || recent) {
      rows.push(row);
    }
  }
  return rows.sort((left, right) => {
    const active = Number(isActive(right)) - Number(isActive(left));
    return active !== 0 ? active : (right.startedAt ?? 0) - (left.startedAt ?? 0);
  });
}

export const countActive = (rows: readonly TaskRow[]) => rows.filter(isActive).length;
