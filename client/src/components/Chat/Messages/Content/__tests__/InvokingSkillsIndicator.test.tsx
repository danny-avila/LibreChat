import React from 'react';
import { RecoilRoot, MutableSnapshot } from 'recoil';
import { render, screen } from '@testing-library/react';
import type { TMessage, TSubmission } from 'librechat-data-provider';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, params?: Record<string, unknown>) =>
    `${key}:${params?.[0] ?? ''}`,
}));

jest.mock('~/Providers', () => ({
  useChatContext: () => ({ index: 0 }),
}));

import InvokingSkillsIndicator from '../InvokingSkillsIndicator';
import store from '~/store';

const USER_MSG_ID = 'user-msg-1';

const makeAssistantMessage = (overrides: Partial<TMessage> = {}): TMessage =>
  ({
    messageId: 'asst-1',
    parentMessageId: USER_MSG_ID,
    conversationId: 'convo-1',
    isCreatedByUser: false,
    sender: 'Assistant',
    text: '',
    ...overrides,
  }) as TMessage;

const makeSubmission = (manualSkills?: string[], userMessageId = USER_MSG_ID): TSubmission =>
  ({
    userMessage: { messageId: userMessageId, text: 'hi', isCreatedByUser: true } as TMessage,
    manualSkills,
    messages: [],
    conversation: {},
    endpointOption: {},
    isTemporary: false,
  }) as unknown as TSubmission;

const renderWithSubmission = (ui: React.ReactNode, submission: TSubmission | null) => {
  const initializeState = (snapshot: MutableSnapshot) => {
    snapshot.set(store.submissionByIndex(0), submission);
  };
  return render(<RecoilRoot initializeState={initializeState}>{ui}</RecoilRoot>);
};

describe('InvokingSkillsIndicator', () => {
  it('renders nothing for user messages', () => {
    const userMsg = { ...makeAssistantMessage(), isCreatedByUser: true } as TMessage;
    const { container } = renderWithSubmission(
      <InvokingSkillsIndicator message={userMsg} />,
      makeSubmission(['pptx']),
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when there is no in-flight submission (history render)', () => {
    const a = makeAssistantMessage();
    const { container } = renderWithSubmission(<InvokingSkillsIndicator message={a} />, null);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the submission has no manualSkills', () => {
    const a = makeAssistantMessage();
    const { container } = renderWithSubmission(
      <InvokingSkillsIndicator message={a} />,
      makeSubmission(),
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders one chip per submission.manualSkills entry on the matching assistant message', () => {
    const a = makeAssistantMessage();
    renderWithSubmission(
      <InvokingSkillsIndicator message={a} />,
      makeSubmission(['brand-guidelines', 'pptx']),
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/brand-guidelines/);
    expect(items[1]).toHaveTextContent(/pptx/);
  });

  it('steps aside once the assistant content carries a skill tool_call (real card landed)', () => {
    const a = makeAssistantMessage({
      content: [
        {
          type: 'tool_call',
          tool_call: { id: 'c1', name: 'skill', args: '{"skillName":"pptx"}', progress: 1 },
        },
      ] as unknown as TMessage['content'],
    });
    const { container } = renderWithSubmission(
      <InvokingSkillsIndicator message={a} />,
      makeSubmission(['pptx']),
    );
    expect(container.firstChild).toBeNull();
  });

  it("does not render on an assistant message that belongs to a different submission's turn", () => {
    const unrelated = makeAssistantMessage({ parentMessageId: 'some-other-user-msg' });
    const { container } = renderWithSubmission(
      <InvokingSkillsIndicator message={unrelated} />,
      makeSubmission(['pptx'], USER_MSG_ID),
    );
    expect(container.firstChild).toBeNull();
  });
});
