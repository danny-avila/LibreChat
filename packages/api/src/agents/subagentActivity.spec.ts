import { EventEmitter } from 'node:events';
import type { IConversation } from '@librechat/data-schemas';
import type { SubagentUpdateEvent } from '@librechat/agents';
import type { Response } from 'express';
import type { IEventTransport } from '~/stream/interfaces/IJobStore';
import type { SubagentActivityEnvelope } from './subagentActivity';
import type { ServerRequest } from '~/types';
import {
  SubagentActivityStream,
  createSubagentActivityStreamHandler,
  subagentActivityStreamId,
} from './subagentActivity';

class TestTransport implements IEventTransport {
  readonly handlers = new Map<
    string,
    {
      onChunk: (event: unknown) => void;
      onDone?: (event: unknown) => void;
      onError?: (error: string) => void;
    }
  >();

  readonly emitted: Array<{ streamId: string; event: unknown }> = [];
  readonly completed: Array<{ streamId: string; event: unknown }> = [];
  readonly cleaned: string[] = [];

  demanded = true;

  subscribe(
    streamId: string,
    handlers: typeof this.handlers extends Map<string, infer T> ? T : never,
  ) {
    this.handlers.set(streamId, handlers);
    return { unsubscribe: () => this.handlers.delete(streamId) };
  }

  emitChunk(streamId: string, event: unknown): void {
    this.emitted.push({ streamId, event });
    this.handlers.get(streamId)?.onChunk(event);
  }

  emitDone(streamId: string, event: unknown): void {
    this.completed.push({ streamId, event });
    this.handlers.get(streamId)?.onDone?.(event);
  }

  emitError(streamId: string, error: string): void {
    this.handlers.get(streamId)?.onError?.(error);
  }

  renewDemand(): void {
    this.demanded = true;
  }

  hasDemand(): boolean {
    return this.demanded;
  }

  getSubscriberCount(streamId: string): number {
    return this.handlers.has(streamId) ? 1 : 0;
  }

  isFirstSubscriber(streamId: string): boolean {
    return !this.handlers.has(streamId);
  }

  onAllSubscribersLeft(): void {}

  cleanup(streamId: string): void {
    this.cleaned.push(streamId);
    this.handlers.delete(streamId);
  }

  getTrackedStreamIds(): string[] {
    return [...this.handlers.keys()];
  }

  destroy(): void {
    this.handlers.clear();
  }
}

const update = (overrides: Partial<SubagentUpdateEvent> = {}): SubagentUpdateEvent => ({
  runId: 'root-run',
  parentRunId: 'parent-run',
  subagentRunId: 'child-run',
  subagentType: 'researcher',
  subagentKind: 'agent',
  subagentAgentId: 'agent-1',
  parentToolCallId: 'tool-call',
  depth: 1,
  ancestry: [
    {
      subagentRunId: 'parent-run',
      subagentType: 'parent',
      subagentKind: 'agent',
      subagentAgentId: 'parent-agent',
      parentRunId: 'root-run',
    },
  ],
  phase: 'message_delta',
  data: { delta: 'Working.' },
  label: 'Drafting the report',
  timestamp: '2026-08-21T20:00:00.000Z',
  ...overrides,
});

describe('detached subagent activity stream', () => {
  it('uses a stable opaque stream id and forwards the existing update envelope', async () => {
    const transport = new TestTransport();
    const stream = new SubagentActivityStream(transport);
    const received: unknown[] = [];
    const streamId = subagentActivityStreamId('child-thread', 'task-1');
    const subscription = stream.subscribe('child-thread', 'task-1', {
      onEvent: (event) => received.push(event),
    });

    await stream.publish('child-thread', 'task-1', update());

    expect(streamId).toMatch(/^subagent-activity:[A-Za-z0-9_-]{32}$/);
    expect(received).toEqual([
      expect.objectContaining({
        event: 'on_subagent_update',
        data: expect.objectContaining({ label: 'Drafting the report' }),
      }),
    ]);
    subscription.unsubscribe();
  });

  it('publishes only while a panel has renewed live-view demand', async () => {
    const transport = new TestTransport();
    transport.demanded = false;
    const stream = new SubagentActivityStream(transport);

    await stream.publish('child-thread', 'task-1', update());
    expect(transport.emitted).toHaveLength(0);

    const subscription = stream.subscribe('child-thread', 'task-1', { onEvent: jest.fn() });
    await subscription.ready;
    await stream.publish('child-thread', 'task-1', update());

    expect(transport.emitted).toHaveLength(1);
    subscription.unsubscribe();
    await Promise.resolve();
    expect(transport.cleaned).toEqual([subagentActivityStreamId('child-thread', 'task-1')]);
  });

  it('drops oversized payload data while retaining lifecycle identity and bounds', async () => {
    const transport = new TestTransport();
    const stream = new SubagentActivityStream(transport);

    await stream.publish(
      'child-thread',
      'task-1',
      update({ data: { delta: 'x'.repeat(256 * 1024) }, label: 'y'.repeat(4096) }),
    );

    const envelope = transport.emitted[0]?.event as {
      data: SubagentUpdateEvent;
    };
    expect(envelope.data.data).toBeUndefined();
    expect(envelope.data.label?.length).toBeLessThanOrEqual(512);
    expect(Buffer.byteLength(JSON.stringify(envelope), 'utf8')).toBeLessThanOrEqual(64 * 1024);
  });

  it('never transports hidden reasoning text to the detached panel', async () => {
    const transport = new TestTransport();
    const stream = new SubagentActivityStream(transport);

    await stream.publish(
      'child-thread',
      'task-1',
      update({ phase: 'reasoning_delta', data: { delta: { content: [{ think: 'secret' }] } } }),
    );

    expect((transport.emitted[0]?.event as SubagentActivityEnvelope).data.data).toBeUndefined();
  });

  it('delivers terminal state before the subscriber releases its task stream', async () => {
    const transport = new TestTransport();
    const stream = new SubagentActivityStream(transport);
    const done: unknown[] = [];
    stream.subscribe('child-thread', 'task-1', {
      onEvent: jest.fn(),
      onDone: (event) => done.push(event),
    });

    await stream.complete('child-thread', 'task-1', 'completed');

    expect(done).toEqual([{ final: true, subagentActivity: true, status: 'completed' }]);
    expect(transport.completed).toHaveLength(1);
    expect(transport.handlers.size).toBe(0);
    await Promise.resolve();
    expect(transport.cleaned).toEqual([subagentActivityStreamId('child-thread', 'task-1')]);
  });
});

type StreamResponse = Response &
  EventEmitter & {
    chunks: string[];
    writableEnded: boolean;
  };

const response = (): StreamResponse => {
  const emitter = new EventEmitter() as StreamResponse;
  emitter.chunks = [];
  emitter.writableEnded = false;
  emitter.status = jest.fn(() => emitter);
  emitter.json = jest.fn(() => emitter);
  emitter.setHeader = jest.fn();
  emitter.flushHeaders = jest.fn();
  emitter.write = jest.fn((chunk: string) => {
    emitter.chunks.push(chunk);
    return true;
  });
  emitter.end = jest.fn(() => {
    emitter.writableEnded = true;
    return emitter;
  });
  return emitter;
};

describe('subagent activity stream authorization', () => {
  const parentConversationId = 'parent-conversation';
  const threadId = 'child-thread';
  const taskId = 'task-1';
  const parent = { tenantId: 'tenant-1' } as IConversation;
  const child = {
    tenantId: 'tenant-1',
    subagentThread: { parentConversationId },
    subagentThreadLease: {
      token: 'lease',
      taskId,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    },
  } as unknown as IConversation;
  const request = () => {
    const req = new EventEmitter() as ServerRequest & EventEmitter;
    req.params = { parentConversationId, threadId, taskId };
    req.user = { id: 'user-1', tenantId: 'tenant-1' } as ServerRequest['user'];
    return req;
  };

  it('streams only the exact active task through its owning parent', async () => {
    const transport = new TestTransport();
    const stream = new SubagentActivityStream(transport);
    const handler = createSubagentActivityStreamHandler(
      {
        getConvoOwnership: jest.fn().mockResolvedValue(parent),
        getSubagentThreadForParent: jest.fn().mockResolvedValue(child),
      },
      stream,
    );
    const req = request();
    const res = response();

    await handler(req, res);
    await stream.publish(threadId, taskId, update());

    expect(res.status).not.toHaveBeenCalled();
    expect(res.chunks.join('')).toContain('"event":"on_subagent_update"');
    expect(res.chunks.join('')).toContain('Drafting the report');
    req.emit('close');
  });

  it('returns the same 404 for a mismatched task without subscribing', async () => {
    const transport = new TestTransport();
    const stream = new SubagentActivityStream(transport);
    const handler = createSubagentActivityStreamHandler(
      {
        getConvoOwnership: jest.fn().mockResolvedValue(parent),
        getSubagentThreadForParent: jest.fn().mockResolvedValue(child),
      },
      stream,
    );
    const req = request();
    (req.params as Record<string, string>).taskId = 'different-task';
    const res = response();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(transport.handlers.size).toBe(0);
  });
});
