import { useCallback, useEffect, useMemo, useState } from 'react';
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
  stopFailed: boolean;
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
  const [stopFailed, setStopFailed] = useState(false);

  useEffect(() => {
    setStoppingThreads((current) => {
      const settled = [...current].filter((threadId) => {
        const status = byThreadId.get(threadId)?.status;
        return status != null && status !== 'running' && status !== 'dispatched';
      });
      if (settled.length === 0) return current;
      const remaining = new Set(current);
      for (const threadId of settled) remaining.delete(threadId);
      return remaining;
    });
  }, [byThreadId]);

  /** Read once per task-list change rather than subscribing, so streaming
   *  message updates do not re-render the header. */
  const args = useMemo(() => {
    const messages = queryClient.getQueryData<TMessage[]>([QueryKeys.messages, conversationId]);
    return findToolCallArgs(messages, data?.tasks ?? []);
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
      setStopFailed(false);
      setStoppingThreads(
        (current) => new Set([...current, ...subagents.map((target) => target.threadId)]),
      );
      const submittedAt = new Date().toISOString();
      const [toolFailed, subagentResults] = await Promise.all([
        toolIds.length > 0
          ? cancelTools({ conversationId, body: { taskIds: toolIds } })
              .then(({ results }) =>
                results.some(
                  (result) =>
                    !['requested', 'already_requested', 'settled'].includes(result.status),
                ),
              )
              .catch(() => true)
          : Promise.resolve(false),
        Promise.allSettled(
          subagents.map(({ threadId, taskId }) =>
            controlSubagent({
              parentConversationId: conversationId,
              threadId,
              command: { taskId, invocationId: v4(), action: 'cancel' },
              submittedAt,
            }),
          ),
        ),
      ]);
      const failedThreads = subagents.flatMap(({ threadId }, index) => {
        const result = subagentResults[index];
        return result.status === 'rejected' ||
          (result.value.receipt.status !== 'accepted' && result.value.receipt.status !== 'applied')
          ? [threadId]
          : [];
      });
      if (failedThreads.length > 0) {
        setStoppingThreads((current) => {
          const remaining = new Set(current);
          for (const threadId of failedThreads) remaining.delete(threadId);
          return remaining;
        });
      }
      let failed = toolFailed || failedThreads.length > 0;
      if (subagents.length > 0) {
        try {
          await refresh();
        } catch {
          failed = true;
        }
      }
      setStopFailed(failed);
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
    stopFailed,
    canStop,
    stop,
    stopAll,
  };
}
