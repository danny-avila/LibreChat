import { useCallback, useMemo, useState } from 'react';
import { v4 } from 'uuid';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import type { TMessage } from 'librechat-data-provider';
import type { TaskRow, ToolCallArgs } from './rows';
import {
  useBackgroundTasksQuery,
  useSubagentControlMutation,
  useCancelBackgroundTasksMutation,
} from '~/data-provider';
import { useParentSubagents } from '~/components/Chat/Subagents/ParentSubagentsProvider';
import parseJsonField from '~/components/Chat/Messages/Content/Parts/parseJsonField';
import { getToolCallIntent } from '~/components/Chat/Messages/Content/Parts/intent';
import { buildTaskRows, countActive, findToolCallArgs } from './rows';

export type BackgroundTasksView = {
  rows: TaskRow[];
  activeCount: number;
  /** Whether the deployment lets users stop ordinary background tools. */
  toolsCancellable: boolean;
  isStopping: boolean;
  canStop: (row: TaskRow) => boolean;
  stop: (row: TaskRow) => Promise<void>;
  stopAll: () => Promise<void>;
};

const describeToolCall = (args: ToolCallArgs): Pick<TaskRow, 'title' | 'detail'> => {
  if (args == null) return {};
  const title = getToolCallIntent(args);
  const detail = parseJsonField(args, 'command') || parseJsonField(args, 'code');
  return {
    ...(title == null ? {} : { title }),
    ...(detail === '' ? {} : { detail }),
  };
};

/**
 * Joins ordinary background tools (process registry) with detached subagents
 * (durable index) for one conversation, and stops one or every running task.
 */
export default function useBackgroundTasks({
  conversationId,
  isSubmitting,
  now,
}: {
  conversationId: string;
  isSubmitting: boolean;
  now: number;
}): BackgroundTasksView {
  const queryClient = useQueryClient();
  const { data } = useBackgroundTasksQuery(conversationId, undefined, isSubmitting);
  const { byThreadId, refresh } = useParentSubagents();
  const { mutateAsync: cancelTools } = useCancelBackgroundTasksMutation();
  const { mutateAsync: controlSubagent } = useSubagentControlMutation();
  const [stoppingThreads, setStoppingThreads] = useState<ReadonlySet<string>>(() => new Set());
  const [isStopping, setIsStopping] = useState(false);

  /** Read once per task-list change rather than subscribing, so streaming
   *  message updates do not re-render the header. */
  const args = useMemo(() => {
    const ids = new Set((data?.tasks ?? []).map((task) => task.toolCallId));
    const messages = queryClient.getQueryData<TMessage[]>([QueryKeys.messages, conversationId]);
    return findToolCallArgs(messages, ids);
  }, [data?.tasks, conversationId, queryClient]);

  const rows = useMemo(
    () =>
      buildTaskRows({
        tools: data?.tasks ?? [],
        subagents: [...byThreadId.values()],
        stoppingThreads,
        now,
        args,
        describe: describeToolCall,
      }),
    [data?.tasks, byThreadId, stoppingThreads, now, args],
  );

  const toolsCancellable = data?.cancellable === true;
  const canStop = useCallback(
    (row: TaskRow) =>
      row.status === 'running' &&
      (row.subagent != null || (row.kind === 'tool' && toolsCancellable)),
    [toolsCancellable],
  );

  const stopRows = useCallback(
    async (targets: TaskRow[]) => {
      const toolIds = targets.flatMap((row) =>
        row.kind === 'tool' && row.taskId ? [row.taskId] : [],
      );
      const subagents = targets.flatMap((row) => (row.subagent == null ? [] : [row.subagent]));
      if (toolIds.length === 0 && subagents.length === 0) return;
      setIsStopping(true);
      setStoppingThreads(
        (current) => new Set([...current, ...subagents.map((target) => target.threadId)]),
      );
      const submittedAt = new Date().toISOString();
      await Promise.allSettled([
        ...(toolIds.length > 0
          ? [cancelTools({ conversationId, body: { taskIds: toolIds } })]
          : []),
        ...subagents.map(({ threadId, taskId }) =>
          controlSubagent({
            parentConversationId: conversationId,
            threadId,
            command: { taskId, invocationId: v4(), action: 'cancel' },
            submittedAt,
          }),
        ),
      ]);
      if (subagents.length > 0) {
        await refresh();
      }
      setIsStopping(false);
    },
    [conversationId, cancelTools, controlSubagent, refresh],
  );

  const stop = useCallback(
    (row: TaskRow) => stopRows(canStop(row) ? [row] : []),
    [stopRows, canStop],
  );
  const stopAll = useCallback(() => stopRows(rows.filter(canStop)), [stopRows, rows, canStop]);

  return {
    rows,
    activeCount: countActive(rows),
    toolsCancellable,
    isStopping,
    canStop,
    stop,
    stopAll,
  };
}
