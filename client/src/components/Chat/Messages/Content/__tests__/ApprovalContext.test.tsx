import React from 'react';
import { RecoilRoot } from 'recoil';
import { act, renderHook } from '@testing-library/react';
import ApprovalProvider, { useApprovalContext, useResumeSubmit } from '../ApprovalContext';
import { ChatContext } from '~/Providers/ChatContext';

const mockApprovalMutate = jest.fn();
const mockAskMutate = jest.fn();

jest.mock('~/data-provider', () => ({
  useSubmitToolApprovalMutation: () => ({ mutate: mockApprovalMutate }),
  useSubmitAskAnswerMutation: () => ({ mutate: mockAskMutate }),
}));

jest.mock('~/store/agents', () => ({
  useGetEphemeralAgent: () => () => undefined,
}));

const chatContextValue = {
  conversation: {
    conversationId: 'conversation-1',
    endpoint: 'agents',
    agent_id: 'agent-1',
  },
} as unknown as React.ContextType<typeof ChatContext>;

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <RecoilRoot>
      <ChatContext.Provider value={chatContextValue}>
        <ApprovalProvider>{children}</ApprovalProvider>
      </ChatContext.Provider>
    </RecoilRoot>
  );
}

describe('useResumeSubmit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('synchronously deduplicates tool approval submissions and unlocks a retryable error', () => {
    const { result } = renderHook(
      () => ({
        approval: useApprovalContext(),
        resume: useResumeSubmit(),
      }),
      { wrapper },
    );

    act(() => {
      result.current.approval.registerToolCall('action-1', 'call-1');
      result.current.approval.setDecision('action-1', 'call-1', {
        tool_call_id: 'call-1',
        decision: 'approve',
      });
    });

    act(() => {
      result.current.resume.submitToolApproval('action-1');
      result.current.resume.submitToolApproval('action-1');
    });
    expect(mockApprovalMutate).toHaveBeenCalledTimes(1);

    const firstOptions = mockApprovalMutate.mock.calls[0][1] as {
      onError: (error: unknown) => void;
    };
    act(() => firstOptions.onError(new Error('temporary failure')));

    act(() => {
      result.current.resume.submitToolApproval('action-1');
      result.current.resume.submitToolApproval('action-1');
    });
    expect(mockApprovalMutate).toHaveBeenCalledTimes(2);
  });
});
