import React from 'react';
import { render, screen } from '@testing-library/react';
import type { TMessage } from 'librechat-data-provider';
import ManualSkillPills from '../ManualSkillPills';

const makeMessage = (overrides: Partial<TMessage> = {}): TMessage =>
  ({
    messageId: 'user-msg-1',
    conversationId: 'convo-1',
    parentMessageId: 'parent',
    sender: 'User',
    text: 'hello',
    isCreatedByUser: true,
    ...overrides,
  }) as TMessage;

describe('ManualSkillPills', () => {
  it('renders nothing for a user message without manualSkills', () => {
    const { container } = render(<ManualSkillPills message={makeMessage()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for non-user messages even if manualSkills is somehow set', () => {
    const assistant = makeMessage({
      isCreatedByUser: false,
      manualSkills: ['pptx'],
    });
    const { container } = render(<ManualSkillPills message={assistant} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one pill per entry in the message manualSkills field', () => {
    const msg = makeMessage({ manualSkills: ['brand-guidelines', 'pptx'] });
    render(<ManualSkillPills message={msg} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('brand-guidelines');
    expect(items[1]).toHaveTextContent('pptx');
  });

  it('renders nothing when manualSkills is an empty array', () => {
    const { container } = render(<ManualSkillPills message={makeMessage({ manualSkills: [] })} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no message is provided', () => {
    const { container } = render(<ManualSkillPills />);
    expect(container.firstChild).toBeNull();
  });
});
