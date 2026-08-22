import { createHash } from 'node:crypto';
import { logger } from '@librechat/data-schemas';
import type { ConversationMethods } from '@librechat/data-schemas';
import type { SubagentUpdateEvent } from '@librechat/agents';
import type { Response } from 'express';
import type { IEventTransport } from '~/stream/interfaces/IJobStore';
import type { ServerRequest } from '~/types';

const STREAM_PREFIX = 'subagent-activity:';
const MAX_ID_BYTES = 512;
const MAX_LABEL_BYTES = 512;
const MAX_ANCESTRY_ENTRIES = 16;
const MAX_EVENT_BYTES = 64 * 1024;
const HEARTBEAT_MS = 15_000;

export type SubagentActivityTerminalStatus = 'completed' | 'failed' | 'cancelled';

export type SubagentActivityEnvelope = {
  event: 'on_subagent_update';
  data: SubagentUpdateEvent;
};

export type SubagentActivitySubscription = {
  unsubscribe: () => void;
  ready?: Promise<void>;
};

export type SubagentActivitySubscriber = {
  onEvent: (event: SubagentActivityEnvelope) => void;
  onDone?: (event: {
    final: true;
    subagentActivity: true;
    status: SubagentActivityTerminalStatus;
  }) => void;
  onError?: (error: string) => void;
};

type SubagentActivityStreamDependencies = Pick<
  ConversationMethods,
  'getConvoOwnership' | 'getSubagentThreadForParent'
>;

type SubagentActivityStreamParams = {
  parentConversationId?: string;
  threadId?: string;
  taskId?: string;
};

const validId = (value: string | undefined): value is string =>
  value != null && value.trim() !== '' && Buffer.byteLength(value, 'utf8') <= MAX_ID_BYTES;

const boundedString = (value: string | undefined, maxBytes = MAX_ID_BYTES): string | undefined => {
  if (value == null) return undefined;
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value;
  let end = Math.min(value.length, maxBytes);
  while (end > 0 && Buffer.byteLength(value.slice(0, end), 'utf8') > maxBytes) end -= 1;
  return value.slice(0, end);
};

const boundedData = (data: unknown, budget: number): unknown => {
  if (data == null) return undefined;
  try {
    return Buffer.byteLength(JSON.stringify(data), 'utf8') <= budget ? data : undefined;
  } catch {
    return undefined;
  }
};

const boundedUpdate = (event: SubagentUpdateEvent): SubagentUpdateEvent => {
  let base: SubagentUpdateEvent = {
    runId: boundedString(event.runId) ?? '',
    parentRunId: boundedString(event.parentRunId) ?? '',
    subagentRunId: boundedString(event.subagentRunId) ?? '',
    subagentType: boundedString(event.subagentType) ?? '',
    subagentKind: event.subagentKind,
    subagentAgentId: boundedString(event.subagentAgentId) ?? '',
    ...(boundedString(event.memberAgentId) == null
      ? {}
      : { memberAgentId: boundedString(event.memberAgentId) }),
    ...(boundedString(event.parentAgentId) == null
      ? {}
      : { parentAgentId: boundedString(event.parentAgentId) }),
    ...(boundedString(event.parentToolCallId) == null
      ? {}
      : { parentToolCallId: boundedString(event.parentToolCallId) }),
    depth: event.depth,
    ancestry: (event.ancestry ?? []).slice(0, MAX_ANCESTRY_ENTRIES).map((entry) => ({
      subagentRunId: boundedString(entry.subagentRunId) ?? '',
      subagentType: boundedString(entry.subagentType) ?? '',
      subagentKind: entry.subagentKind,
      subagentAgentId: boundedString(entry.subagentAgentId) ?? '',
      parentRunId: boundedString(entry.parentRunId) ?? '',
      ...(boundedString(entry.parentAgentId) == null
        ? {}
        : { parentAgentId: boundedString(entry.parentAgentId) }),
      ...(boundedString(entry.parentToolCallId) == null
        ? {}
        : { parentToolCallId: boundedString(entry.parentToolCallId) }),
    })),
    phase: event.phase,
    ...(boundedString(event.label, MAX_LABEL_BYTES) == null
      ? {}
      : { label: boundedString(event.label, MAX_LABEL_BYTES) }),
    timestamp: boundedString(event.timestamp) ?? new Date().toISOString(),
  };
  let baseBytes = Buffer.byteLength(
    JSON.stringify({ event: 'on_subagent_update', data: base }),
    'utf8',
  );
  if (baseBytes > MAX_EVENT_BYTES) {
    base = { ...base, ancestry: [] };
    baseBytes = Buffer.byteLength(
      JSON.stringify({ event: 'on_subagent_update', data: base }),
      'utf8',
    );
  }
  /** Detached durable views expose only a reasoning marker. Keep that same boundary
   * on the live path rather than transporting hidden reasoning text to the browser. */
  const data =
    event.phase === 'reasoning_delta'
      ? undefined
      : boundedData(event.data, Math.max(0, MAX_EVENT_BYTES - baseBytes - 32));
  return data == null ? base : { ...base, data };
};

const isTerminalEvent = (
  value: unknown,
): value is {
  final: true;
  subagentActivity: true;
  status: SubagentActivityTerminalStatus;
} => {
  if (value == null || typeof value !== 'object') return false;
  const event = value as {
    final?: unknown;
    subagentActivity?: unknown;
    status?: unknown;
  };
  return (
    event.final === true &&
    event.subagentActivity === true &&
    (event.status === 'completed' || event.status === 'failed' || event.status === 'cancelled')
  );
};

const isActivityEnvelope = (value: unknown): value is SubagentActivityEnvelope => {
  if (value == null || typeof value !== 'object') return false;
  const envelope = value as { event?: unknown; data?: unknown };
  return (
    envelope.event === 'on_subagent_update' &&
    envelope.data != null &&
    typeof envelope.data === 'object'
  );
};

export const subagentActivityStreamId = (threadId: string, taskId: string): string =>
  `${STREAM_PREFIX}${createHash('sha256')
    .update(`${threadId}\u0000${taskId}`)
    .digest('base64url')
    .slice(0, 32)}`;

/** Task-scoped live activity over the same in-memory/Redis transports used by generation SSE. */
export class SubagentActivityStream {
  constructor(private readonly transport: IEventTransport) {}

  publish(threadId: string, taskId: string, event: SubagentUpdateEvent): Promise<void> {
    const envelope: SubagentActivityEnvelope = {
      event: 'on_subagent_update',
      data: boundedUpdate(event),
    };
    return Promise.resolve(
      this.transport.emitChunk(subagentActivityStreamId(threadId, taskId), envelope),
    ).then(() => undefined);
  }

  subscribe(
    threadId: string,
    taskId: string,
    subscriber: SubagentActivitySubscriber,
  ): SubagentActivitySubscription {
    let unsubscribe = (): void => undefined;
    const subscription = this.transport.subscribe(subagentActivityStreamId(threadId, taskId), {
      onChunk: (event) => {
        if (isActivityEnvelope(event)) subscriber.onEvent(event);
      },
      onDone: (event) => {
        if (!isTerminalEvent(event)) return;
        try {
          subscriber.onDone?.(event);
        } finally {
          unsubscribe();
        }
      },
      onError: (error) => {
        try {
          subscriber.onError?.(error);
        } finally {
          unsubscribe();
        }
      },
    });
    unsubscribe = subscription.unsubscribe;
    return subscription;
  }

  async complete(
    threadId: string,
    taskId: string,
    status: SubagentActivityTerminalStatus,
  ): Promise<void> {
    const streamId = subagentActivityStreamId(threadId, taskId);
    await this.transport.emitDone(streamId, {
      final: true,
      subagentActivity: true,
      status,
    });
  }

  destroy(): void {
    this.transport.destroy();
  }
}

const notFound = (res: Response): void => {
  res.status(404).json({ error: 'Conversation not found' });
};

const writeSse = (res: Response, value: unknown): void => {
  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify(value)}\n\n`);
  }
};

/** Streams one active child task after the same parent/tenant authorization as its durable view. */
export function createSubagentActivityStreamHandler(
  deps: SubagentActivityStreamDependencies,
  stream: Pick<SubagentActivityStream, 'subscribe'>,
) {
  return async (req: ServerRequest, res: Response): Promise<void> => {
    const userId = req.user?.id;
    const tenantId = req.user?.tenantId || undefined;
    const { parentConversationId, threadId, taskId } = req.params as SubagentActivityStreamParams;
    if (
      !userId ||
      !validId(parentConversationId) ||
      !validId(threadId) ||
      !validId(taskId) ||
      parentConversationId === threadId
    ) {
      notFound(res);
      return;
    }

    try {
      const [parent, child] = await Promise.all([
        deps.getConvoOwnership(userId, parentConversationId, tenantId ?? null),
        deps.getSubagentThreadForParent({
          user: userId,
          parentConversationId,
          conversationId: threadId,
          ...(tenantId == null ? {} : { tenantId }),
        }),
      ]);
      const lineage = child?.subagentThread;
      const lease = child?.subagentThreadLease;
      const authorized =
        parent != null &&
        child != null &&
        lineage?.parentConversationId === parentConversationId &&
        parent.tenantId === tenantId &&
        child.tenantId === tenantId &&
        lease?.taskId === taskId &&
        lease.expiresAt > new Date();
      if (!authorized) {
        notFound(res);
        return;
      }

      res.setHeader('Content-Encoding', 'identity');
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      let subscription: SubagentActivitySubscription | undefined;
      const heartbeat = setInterval(() => {
        if (!res.writableEnded) res.write(': keep-alive\n\n');
      }, HEARTBEAT_MS);
      heartbeat.unref?.();
      const close = () => {
        clearInterval(heartbeat);
        subscription?.unsubscribe();
      };
      try {
        subscription = stream.subscribe(threadId, taskId, {
          onEvent: (event) => writeSse(res, event),
          onDone: (event) => {
            close();
            writeSse(res, event);
            res.end();
          },
          onError: () => {
            close();
            writeSse(res, { error: 'Subagent activity stream unavailable' });
            res.end();
          },
        });
        req.once('close', close);
        await subscription.ready;
      } catch (error) {
        close();
        throw error;
      }
      writeSse(res, { ready: true });
    } catch (error) {
      logger.error('[subagentActivity] Failed to open child activity stream', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to open subagent activity stream' });
        return;
      }
      writeSse(res, { error: 'Subagent activity stream unavailable' });
      res.end();
    }
  };
}

export const SUBAGENT_ACTIVITY_STREAM_LIMITS = Object.freeze({
  eventBytes: MAX_EVENT_BYTES,
  labelBytes: MAX_LABEL_BYTES,
});
