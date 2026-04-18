import React from 'react';
import { render, screen } from '@testing-library/react';
import type { TMessage } from 'librechat-data-provider';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, params?: Record<string, unknown>) =>
    `${key}:${params?.[0] ?? ''}`,
}));

const mockGetMessages = jest.fn<TMessage[] | undefined, []>();
jest.mock('~/Providers', () => ({
  useChatContext: () => ({ getMessages: mockGetMessages }),
}));

import InvokingSkillsIndicator from '../InvokingSkillsIndicator';

const CONVO_ID = 'convo-1';
const USER_MSG_ID = 'user-msg-1';

const userMsg = (manualSkills?: string[]): TMessage =>
  ({
    messageId: USER_MSG_ID,
    conversationId: CONVO_ID,
    parentMessageId: '00000000-0000-0000-0000-000000000000',
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

beforeEach(() => {
  mockGetMessages.mockReset();
});

describe('InvokingSkillsIndicator', () => {
  it('renders nothing for user messages', () => {
    mockGetMessages.mockReturnValue([userMsg(['pptx'])]);
    const { container } = render(<InvokingSkillsIndicator message={userMsg(['pptx'])} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the parent user message has no manualSkills', () => {
    const a = assistantMsg();
    mockGetMessages.mockReturnValue([userMsg(), a]);
    const { container } = render(<InvokingSkillsIndicator message={a} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one loading chip per parent.manualSkills entry while the assistant has no skill card yet', () => {
    const u = userMsg(['brand-guidelines', 'pptx']);
    const a = assistantMsg([{ type: 'text', text: 'streaming tokens...' }]);
    mockGetMessages.mockReturnValue([u, a]);
    render(<InvokingSkillsIndicator message={a} />);
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
    mockGetMessages.mockReturnValue([u, a]);
    const { container } = render(<InvokingSkillsIndicator message={a} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the assistant message has no parent (orphan / root)', () => {
    const orphan = {
      ...assistantMsg(),
      parentMessageId: '00000000-0000-0000-0000-000000000000',
    } as TMessage;
    mockGetMessages.mockReturnValue([orphan]);
    const { container } = render(<InvokingSkillsIndicator message={orphan} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when getMessages returns undefined (cache miss)', () => {
    const a = assistantMsg();
    mockGetMessages.mockReturnValue(undefined);
    const { container } = render(<InvokingSkillsIndicator message={a} />);
    expect(container.firstChild).toBeNull();
  });
});
