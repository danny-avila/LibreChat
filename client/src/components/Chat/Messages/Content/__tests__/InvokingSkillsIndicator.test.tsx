import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, params?: Record<string, unknown>) =>
    `${key}:${params?.[0] ?? ''}`,
}));

import InvokingSkillsIndicator from '../InvokingSkillsIndicator';

const CONVO_ID = 'convo-1';
const USER_MSG_ID = 'user-msg-1';

const renderWith = (ui: React.ReactNode, messages: TMessage[]) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData<TMessage[]>([QueryKeys.messages, CONVO_ID], messages);
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

const userMsg = (manualSkills?: string[]): TMessage =>
  ({
    messageId: USER_MSG_ID,
    conversationId: CONVO_ID,
    parentMessageId: null,
    isCreatedByUser: true,
    sender: 'User',
    text: 'hi',
    manualSkills,
  }) as TMessage;

const assistantMsg = (content?: unknown[]): TMessage =>
  ({
    messageId: 'asst-1',
    parentMessageId: USER_MSG_ID,
    conversationId: CONVO_ID,
    isCreatedByUser: false,
    sender: 'Assistant',
    text: '',
    content,
  }) as unknown as TMessage;

describe('InvokingSkillsIndicator', () => {
  it('renders nothing for user messages', () => {
    const { container } = renderWith(<InvokingSkillsIndicator message={userMsg(['pptx'])} />, [
      userMsg(['pptx']),
    ]);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the parent user message has no manualSkills', () => {
    const a = assistantMsg();
    const { container } = renderWith(<InvokingSkillsIndicator message={a} />, [userMsg(), a]);
    expect(container.firstChild).toBeNull();
  });

  it('renders one loading chip per parent.manualSkills entry while the assistant has no skill card yet', () => {
    const u = userMsg(['brand-guidelines', 'pptx']);
    const a = assistantMsg([{ type: 'text', text: 'streaming tokens...' }]);
    renderWith(<InvokingSkillsIndicator message={a} />, [u, a]);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/brand-guidelines/);
    expect(items[1]).toHaveTextContent(/pptx/);
  });

  it('steps aside once the assistant content carries a `skill` tool_call (real card landed)', () => {
    const u = userMsg(['pptx']);
    const a = assistantMsg([
      {
        type: 'tool_call',
        tool_call: { id: 'c1', name: 'skill', args: '{"skillName":"pptx"}', progress: 1 },
      },
      { type: 'text', text: 'response...' },
    ]);
    const { container } = renderWith(<InvokingSkillsIndicator message={a} />, [u, a]);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the assistant message is missing a parent (orphan)', () => {
    const orphan = { ...assistantMsg(), parentMessageId: null } as TMessage;
    const { container } = renderWith(<InvokingSkillsIndicator message={orphan} />, [orphan]);
    expect(container.firstChild).toBeNull();
  });
});
