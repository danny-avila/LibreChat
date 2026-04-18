import React from 'react';
import { render, screen } from '@testing-library/react';
import type { TMessage } from 'librechat-data-provider';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, params?: Record<string, unknown>) =>
    `${key}:${params?.[0] ?? ''}`,
}));

import InvokingSkillsIndicator from '../InvokingSkillsIndicator';

const makeAssistantMessage = (overrides: Partial<TMessage> = {}): TMessage =>
  ({
    messageId: 'asst-1',
    parentMessageId: 'user-1',
    conversationId: 'convo-1',
    isCreatedByUser: false,
    sender: 'Assistant',
    text: '',
    ...overrides,
  }) as TMessage;

describe('InvokingSkillsIndicator', () => {
  it('renders nothing for user messages even when manualSkills is set', () => {
    const userMsg = {
      ...makeAssistantMessage(),
      isCreatedByUser: true,
      manualSkills: ['pptx'],
    } as TMessage;
    const { container } = render(<InvokingSkillsIndicator message={userMsg} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the assistant message has no manualSkills seeded', () => {
    const { container } = render(<InvokingSkillsIndicator message={makeAssistantMessage()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one chip per manualSkills entry seeded by createdHandler', () => {
    const a = makeAssistantMessage({ manualSkills: ['brand-guidelines', 'pptx'] });
    render(<InvokingSkillsIndicator message={a} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/brand-guidelines/);
    expect(items[1]).toHaveTextContent(/pptx/);
  });

  it('steps aside once the assistant content carries a skill tool_call (real card landed)', () => {
    const a = makeAssistantMessage({
      manualSkills: ['pptx'],
      content: [
        {
          type: 'tool_call',
          tool_call: { id: 'c1', name: 'skill', args: '{"skillName":"pptx"}', progress: 1 },
        },
      ] as unknown as TMessage['content'],
    });
    const { container } = render(<InvokingSkillsIndicator message={a} />);
    expect(container.firstChild).toBeNull();
  });

  it('keeps chips visible when content has non-skill tool_calls (e.g. web_search in progress)', () => {
    const a = makeAssistantMessage({
      manualSkills: ['pptx'],
      content: [
        {
          type: 'tool_call',
          tool_call: { id: 'c1', name: 'web_search', args: '{}', progress: 0.5 },
        },
      ] as unknown as TMessage['content'],
    });
    render(<InvokingSkillsIndicator message={a} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('keeps chips visible when content is text only (still streaming, no card yet)', () => {
    const a = makeAssistantMessage({
      manualSkills: ['pptx'],
      content: [{ type: 'text', text: 'streaming tokens...' }] as unknown as TMessage['content'],
    });
    render(<InvokingSkillsIndicator message={a} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('renders nothing when message prop is absent', () => {
    const { container } = render(<InvokingSkillsIndicator />);
    expect(container.firstChild).toBeNull();
  });
});
