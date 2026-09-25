import { ContentTypes } from 'librechat-data-provider';
import type { ParentSubagentSummary, TMessage } from 'librechat-data-provider';
import { RECENT_SUBAGENT_WINDOW_MS, buildTaskRows, findToolCallArgs } from '../rows';

const now = Date.parse('2026-09-24T12:00:00.000Z');
const iso = (offsetMs: number) => new Date(now - offsetMs).toISOString();

const child = (overrides: Partial<ParentSubagentSummary>): ParentSubagentSummary => ({
  threadId: 'thread',
  parentMessageId: 'message',
  subagentType: 'researcher',
  subagentKind: 'agent',
  title: 'Child',
  origin: 'tool',
  status: 'completed',
  latestTaskId: 'task',
  tasks: [{ taskId: 'task', status: 'completed', createdAt: iso(60_000) }],
  tasksTruncated: false,
  ...overrides,
});

describe('buildTaskRows', () => {
  it('orders active rows first and drops subagents settled past the retention window', () => {
    const rows = buildTaskRows({
      now,
      args: new Map(),
      describe: () => ({}),
      stoppingThreads: new Set(['running-child']),
      tools: [
        {
          taskId: 'done',
          toolName: 'bash_tool',
          toolCallId: 'call-done',
          status: 'completed',
          cancellationRequested: false,
          startedAt: iso(1_000),
          settledAt: iso(500),
        },
        {
          taskId: 'stopping',
          toolName: 'bash_tool',
          toolCallId: 'call-stopping',
          status: 'running',
          cancellationRequested: true,
          startedAt: iso(90_000),
        },
      ],
      subagents: [
        child({ threadId: 'running-child', status: 'dispatched' }),
        child({ threadId: 'recent-child', status: 'failed', updatedAt: iso(10_000) }),
        child({ threadId: 'old-child', updatedAt: iso(RECENT_SUBAGENT_WINDOW_MS + 1) }),
      ],
    });

    expect(rows.map((row) => [row.id, row.status])).toEqual([
      ['subagent:running-child', 'stopping'],
      ['tool:stopping', 'stopping'],
      ['tool:done', 'completed'],
      ['subagent:recent-child', 'error'],
    ]);
    expect(rows[0].subagent).toEqual({ threadId: 'running-child', taskId: 'task' });
    expect(rows[3].subagent).toBeUndefined();
  });
});

describe('findToolCallArgs', () => {
  it('resolves only the requested tool calls', () => {
    const messages = [
      {
        messageId: 'm1',
        content: [
          { type: ContentTypes.TEXT, text: 'hi' },
          {
            type: ContentTypes.TOOL_CALL,
            tool_call: { id: 'a', name: 'bash_tool', args: '{"command":"ls"}' },
          },
          { type: ContentTypes.TOOL_CALL, tool_call: { id: 'b', name: 'bash_tool', args: '{}' } },
        ],
      },
    ] as unknown as TMessage[];
    expect(findToolCallArgs(messages, new Set(['a']))).toEqual(
      new Map([['a', '{"command":"ls"}']]),
    );
    expect(findToolCallArgs(undefined, new Set(['a'])).size).toBe(0);
  });
});
