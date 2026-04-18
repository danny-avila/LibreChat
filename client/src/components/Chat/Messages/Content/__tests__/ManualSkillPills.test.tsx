import React from 'react';
import { RecoilRoot, MutableSnapshot } from 'recoil';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import ManualSkillPills from '../ManualSkillPills';
import store from '~/store';

const CONVO_ID = 'convo-1';
const USER_MSG_ID = 'user-msg-1';

const makeUserMessage = (overrides: Partial<TMessage> = {}): TMessage =>
  ({
    messageId: USER_MSG_ID,
    conversationId: CONVO_ID,
    parentMessageId: 'parent',
    sender: 'User',
    text: 'hello',
    isCreatedByUser: true,
    ...overrides,
  }) as TMessage;

const renderWithProviders = (
  ui: React.ReactNode,
  { initialSkills, messages }: { initialSkills?: string[]; messages?: TMessage[] } = {},
) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (messages) {
    queryClient.setQueryData<TMessage[]>([QueryKeys.messages, CONVO_ID], messages);
  }
  const initializeState = (snapshot: MutableSnapshot) => {
    if (initialSkills && initialSkills.length > 0) {
      snapshot.set(store.attachedSkillsByMessageId(USER_MSG_ID), initialSkills);
    }
  };
  return render(
    <RecoilRoot initializeState={initializeState}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </RecoilRoot>,
  );
};

describe('ManualSkillPills', () => {
  it('renders nothing when no skills are attached to the message', () => {
    const { container } = renderWithProviders(<ManualSkillPills message={makeUserMessage()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for non-user messages even if skills somehow attach', () => {
    const assistant = makeUserMessage({ isCreatedByUser: false });
    const { container } = renderWithProviders(<ManualSkillPills message={assistant} />, {
      initialSkills: ['pptx'],
    });
    expect(container.firstChild).toBeNull();
  });

  it('renders one pill per attached skill', () => {
    renderWithProviders(<ManualSkillPills message={makeUserMessage()} />, {
      initialSkills: ['brand-guidelines', 'pptx'],
    });
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('brand-guidelines');
    expect(items[1]).toHaveTextContent('pptx');
  });

  it('hides once the sibling assistant response has a skill tool_call (live card arrived)', () => {
    const user = makeUserMessage();
    const assistant = {
      messageId: 'asst-1',
      parentMessageId: USER_MSG_ID,
      conversationId: CONVO_ID,
      isCreatedByUser: false,
      content: [
        {
          type: 'tool_call',
          tool_call: { id: 'c1', name: 'skill', args: '{"skillName":"pptx"}', progress: 1 },
        },
      ],
    } as unknown as TMessage;

    const { container } = renderWithProviders(<ManualSkillPills message={user} />, {
      initialSkills: ['pptx'],
      messages: [user, assistant],
    });
    expect(container.firstChild).toBeNull();
  });

  it('keeps pills visible when the sibling has content but no skill tool_call yet', () => {
    const user = makeUserMessage();
    const assistant = {
      messageId: 'asst-1',
      parentMessageId: USER_MSG_ID,
      conversationId: CONVO_ID,
      isCreatedByUser: false,
      content: [{ type: 'text', text: 'partial response...' }],
    } as unknown as TMessage;

    renderWithProviders(<ManualSkillPills message={user} />, {
      initialSkills: ['pptx'],
      messages: [user, assistant],
    });
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(1);
  });
});
