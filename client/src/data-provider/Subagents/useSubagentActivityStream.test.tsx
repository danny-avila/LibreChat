import React from 'react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { act, renderHook } from '@testing-library/react';
import { QueryKeys, StepEvents } from 'librechat-data-provider';
import type { ActiveSubagentPanel } from '~/store/subagents';
import { subagentProgressByToolCallId, subagentProgressKey } from '~/store/subagents';
import useSubagentActivityStream from './useSubagentActivityStream';

type Listener = (event: MessageEvent) => void;
type MockStream = {
  url: string;
  options: { method?: string; headers?: Record<string, string> };
  listeners: Record<string, Listener>;
  close: jest.Mock;
  emit: (type: string, data: unknown) => void;
};

const streams: MockStream[] = [];
jest.mock('sse.js', () => ({
  SSE: jest.fn().mockImplementation((url: string, options: MockStream['options']) => {
    const listeners: Record<string, Listener> = {};
    const stream: MockStream = {
      url,
      options,
      listeners,
      close: jest.fn(),
      emit: (type, data) => listeners[type]?.({ data: JSON.stringify(data) } as MessageEvent),
    };
    streams.push(stream);
    return {
      addEventListener: (type: string, listener: Listener) => {
        listeners[type] = listener;
      },
      close: stream.close,
    };
  }),
}));

const mockInvalidateQueries = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => ({ token: 'token-1', isAuthenticated: true }),
}));

const selection: ActiveSubagentPanel = {
  host: 'conversation',
  parentConversationId: 'parent conversation',
  parentMessageId: 'parent-message',
  toolCallId: 'tool-call',
  partIndex: 1,
  subagentType: 'researcher',
  initialProgress: 1,
  isSubmitting: false,
  durable: { threadId: 'child/thread', taskId: 'task?1' },
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <RecoilRoot>{children}</RecoilRoot>
);

describe('useSubagentActivityStream', () => {
  beforeEach(() => {
    streams.length = 0;
    mockInvalidateQueries.mockClear();
  });

  it('opens one authorized task stream and closes after terminal delivery', () => {
    const { result, unmount } = renderHook(
      () => {
        useSubagentActivityStream(selection);
        return useRecoilValue(
          subagentProgressByToolCallId(
            subagentProgressKey(
              selection.parentMessageId,
              selection.toolCallId,
              selection.partIndex,
            ),
          ),
        );
      },
      { wrapper },
    );

    expect(streams).toHaveLength(1);
    expect(streams[0]?.url).toContain(
      '/api/convos/parent%20conversation/subagents/child%2Fthread/tasks/task%3F1/activity',
    );
    expect(streams[0]?.options.headers).toEqual({ Authorization: 'Bearer token-1' });

    act(() => {
      streams[0]?.emit('message', {
        event: StepEvents.ON_SUBAGENT_UPDATE,
        data: {
          runId: 'root',
          parentRunId: 'parent',
          subagentRunId: 'child',
          subagentType: 'researcher',
          subagentKind: 'agent',
          subagentAgentId: 'agent-1',
          parentToolCallId: 'tool-call',
          depth: 1,
          ancestry: ['parent'],
          phase: 'message_delta',
          data: { delta: { content: [{ type: 'text', text: 'Live child output' }] } },
          timestamp: '2026-08-21T20:00:00.000Z',
        },
      });
      streams[0]?.emit('message', {
        final: true,
        subagentActivity: true,
        status: 'completed',
      });
    });

    expect(result.current?.contentParts).toEqual([{ type: 'text', text: 'Live child output' }]);
    expect(streams[0]?.close).toHaveBeenCalledTimes(1);
    expect(mockInvalidateQueries).toHaveBeenCalledWith([
      QueryKeys.subagentThread,
      'parent conversation',
      'child/thread',
      'task?1',
    ]);
    unmount();
    expect(streams[0]?.close).toHaveBeenCalledTimes(1);
  });

  it('never opens the private task stream for shares or foreground children', () => {
    const { rerender } = renderHook(({ value }) => useSubagentActivityStream(value), {
      initialProps: { value: { ...selection, host: 'share' } as ActiveSubagentPanel },
      wrapper,
    });
    expect(streams).toHaveLength(0);

    rerender({ value: { ...selection, host: 'conversation', durable: undefined } });
    expect(streams).toHaveLength(0);
  });
});
