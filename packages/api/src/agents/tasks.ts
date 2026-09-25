import { EModelEndpoint } from 'librechat-data-provider';
import type {
  BackgroundTaskCancelResponse,
  BackgroundTaskSummary,
  BackgroundTaskIndex,
  TAgentsEndpoint,
} from 'librechat-data-provider';
import type { Response } from 'express';
import type { BackgroundTask, BackgroundTaskRegistryClass } from './background';
import type { ServerRequest } from '~/types';

/** The registry surface the user-facing task routes read and act on. */
export type BackgroundTaskRegistryView = Pick<
  BackgroundTaskRegistryClass,
  'list' | 'requestCancellation'
>;

export interface BackgroundTaskRouteDependencies {
  registry: BackgroundTaskRegistryView;
}

const MAX_CONVERSATION_ID_LENGTH = 256;
const MAX_CANCEL_TASK_IDS = 64;
const MAX_TASK_ID_LENGTH = 256;

const validConversationId = (value: string | undefined): value is string =>
  value != null && value.trim() !== '' && value.length <= MAX_CONVERSATION_ID_LENGTH;

const validTaskId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '' && value.length <= MAX_TASK_ID_LENGTH;

/** User cancellation of ordinary tools shares the model tool's opt-in. */
export function ordinaryToolCancellationEnabled(config: TAgentsEndpoint | undefined): boolean {
  return config?.backgroundTasks?.ordinaryToolCancellation === true;
}

const agentsConfig = (req: ServerRequest): TAgentsEndpoint | undefined =>
  req.config?.endpoints?.[EModelEndpoint.agents] as TAgentsEndpoint | undefined;

/**
 * Projects a registry task for the client. Results, artifacts and errors stay
 * server-side, matching the model tool's metadata-only list path.
 */
export function toBackgroundTaskSummary(task: BackgroundTask): BackgroundTaskSummary {
  const settled = task.status !== 'running';
  return {
    taskId: task.id,
    toolName: task.toolName,
    toolCallId: task.toolCallId,
    ...(task.messageId == null ? {} : { messageId: task.messageId }),
    status: task.status,
    cancellationRequested: task.cancellationRequestedAt != null,
    startedAt: new Date(task.createdAt).toISOString(),
    ...(settled && task.settledAt != null
      ? { settledAt: new Date(task.settledAt).toISOString() }
      : {}),
  };
}

/**
 * Lists the caller's background tool tasks for one conversation. The registry
 * is keyed by user and conversation, so another user's tasks are unreachable
 * without a database read; tasks owned by another replica are not visible.
 */
export function createBackgroundTaskIndexHandler(deps: BackgroundTaskRouteDependencies) {
  return (req: ServerRequest, res: Response): void => {
    const userId = req.user?.id;
    const { conversationId } = req.params as { conversationId?: string };
    if (!userId || !validConversationId(conversationId)) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    const body: BackgroundTaskIndex = {
      conversationId,
      tasks: deps.registry.list(userId, conversationId).map(toBackgroundTaskSummary),
      cancellable: ordinaryToolCancellationEnabled(agentsConfig(req)),
    };
    res.status(200).json(body);
  };
}

/**
 * Requests cooperative cancellation of the caller's background tool tasks.
 * Without `taskIds` every running task in the conversation is targeted. Each
 * task reports the registry outcome; `unavailable` means the owning process
 * holds no cancellation handle for it.
 */
export function createBackgroundTaskCancelHandler(deps: BackgroundTaskRouteDependencies) {
  return (req: ServerRequest, res: Response): void => {
    const userId = req.user?.id;
    const { conversationId } = req.params as { conversationId?: string };
    if (!userId || !validConversationId(conversationId)) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    if (!ordinaryToolCancellationEnabled(agentsConfig(req))) {
      res.status(403).json({ error: 'Background task cancellation is not enabled' });
      return;
    }

    const payload: unknown = req.body;
    if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
      res.status(400).json({ error: 'Invalid background task cancellation request' });
      return;
    }
    const hasTaskIds = 'taskIds' in payload;
    const requested = hasTaskIds ? payload.taskIds : undefined;
    if (
      hasTaskIds &&
      (!Array.isArray(requested) ||
        requested.length > MAX_CANCEL_TASK_IDS ||
        !requested.every(validTaskId))
    ) {
      res.status(400).json({ error: 'Invalid background task cancellation request' });
      return;
    }

    const taskIds = hasTaskIds
      ? [...new Set(requested as string[])]
      : deps.registry
          .list(userId, conversationId)
          .filter((task) => task.status === 'running')
          .map((task) => task.id);

    const body: BackgroundTaskCancelResponse = {
      results: taskIds.map((taskId) => ({
        taskId,
        status: deps.registry.requestCancellation(userId, conversationId, taskId).status,
      })),
    };
    res.status(200).json(body);
  };
}
