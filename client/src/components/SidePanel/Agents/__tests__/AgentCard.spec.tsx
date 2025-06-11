import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AgentCard from '../AgentCard';
import type t from 'librechat-data-provider';

// Mock useLocalize hook
jest.mock('~/hooks/useLocalize', () => () => (key: string) => {
  const mockTranslations: Record<string, string> = {
    com_agents_created_by: 'Created by',
  };
  return mockTranslations[key] || key;
});

describe('AgentCard', () => {
  const mockAgent: t.Agent = {
    id: '1',
    name: 'Test Agent',
    description: 'A test agent for testing purposes',
    support_contact: {
      name: 'Test Support',
      email: 'test@example.com',
    },
    avatar: { filepath: '/test-avatar.png', source: 'local' },
    created_at: 1672531200000,
    instructions: 'Test instructions',
    provider: 'openai' as const,
    model: 'gpt-4',
    model_parameters: {
      temperature: 0.7,
      maxContextTokens: 4096,
      max_context_tokens: 4096,
      max_output_tokens: 1024,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    },
  };

  const mockOnClick = jest.fn();

  beforeEach(() => {
    mockOnClick.mockClear();
  });

  it('renders agent information correctly', () => {
    render(<AgentCard agent={mockAgent} onClick={mockOnClick} />);

    expect(screen.getByText('Test Agent')).toBeInTheDocument();
    expect(screen.getByText('A test agent for testing purposes')).toBeInTheDocument();
    expect(screen.getByText('Created by')).toBeInTheDocument();
    expect(screen.getByText('Test Support')).toBeInTheDocument();
  });

  it('displays avatar when provided as object', () => {
    render(<AgentCard agent={mockAgent} onClick={mockOnClick} />);

    const avatarImg = screen.getByAltText('Test Agent avatar');
    expect(avatarImg).toBeInTheDocument();
    expect(avatarImg).toHaveAttribute('src', '/test-avatar.png');
  });

  it('displays avatar when provided as string', () => {
    const agentWithStringAvatar = {
      ...mockAgent,
      avatar: '/string-avatar.png' as any, // Legacy support for string avatars
    };

    render(<AgentCard agent={agentWithStringAvatar} onClick={mockOnClick} />);

    const avatarImg = screen.getByAltText('Test Agent avatar');
    expect(avatarImg).toBeInTheDocument();
    expect(avatarImg).toHaveAttribute('src', '/string-avatar.png');
  });

  it('displays Bot icon fallback when no avatar is provided', () => {
    const agentWithoutAvatar = {
      ...mockAgent,
      avatar: undefined,
    };

    render(<AgentCard agent={agentWithoutAvatar as any as t.Agent} onClick={mockOnClick} />);

    // Check for Bot icon presence by looking for the svg with lucide-bot class
    const botIcon = document.querySelector('.lucide-bot');
    expect(botIcon).toBeInTheDocument();
  });

  it('calls onClick when card is clicked', () => {
    render(<AgentCard agent={mockAgent} onClick={mockOnClick} />);

    const card = screen.getByRole('button');
    fireEvent.click(card);

    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick when Enter key is pressed', () => {
    render(<AgentCard agent={mockAgent} onClick={mockOnClick} />);

    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick when Space key is pressed', () => {
    render(<AgentCard agent={mockAgent} onClick={mockOnClick} />);

    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: ' ' });

    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick for other keys', () => {
    render(<AgentCard agent={mockAgent} onClick={mockOnClick} />);

    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: 'Escape' });

    expect(mockOnClick).not.toHaveBeenCalled();
  });

  it('applies additional className when provided', () => {
    render(<AgentCard agent={mockAgent} onClick={mockOnClick} className="custom-class" />);

    const card = screen.getByRole('button');
    expect(card).toHaveClass('custom-class');
  });

  it('handles missing support contact gracefully', () => {
    const agentWithoutContact = {
      ...mockAgent,
      support_contact: undefined,
      authorName: undefined,
    };

    render(<AgentCard agent={agentWithoutContact} onClick={mockOnClick} />);

    expect(screen.getByText('Test Agent')).toBeInTheDocument();
    expect(screen.getByText('A test agent for testing purposes')).toBeInTheDocument();
    expect(screen.queryByText(/Created by/)).not.toBeInTheDocument();
  });

  it('displays authorName when support_contact is missing', () => {
    const agentWithAuthorName = {
      ...mockAgent,
      support_contact: undefined,
      authorName: 'John Doe',
    };

    render(<AgentCard agent={agentWithAuthorName} onClick={mockOnClick} />);

    expect(screen.getByText('Created by')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('displays support_contact email when name is missing', () => {
    const agentWithEmailOnly = {
      ...mockAgent,
      support_contact: { email: 'contact@example.com' },
      authorName: undefined,
    };

    render(<AgentCard agent={agentWithEmailOnly} onClick={mockOnClick} />);

    expect(screen.getByText('Created by')).toBeInTheDocument();
    expect(screen.getByText('contact@example.com')).toBeInTheDocument();
  });

  it('prioritizes support_contact name over authorName', () => {
    const agentWithBoth = {
      ...mockAgent,
      support_contact: { name: 'Support Team' },
      authorName: 'John Doe',
    };

    render(<AgentCard agent={agentWithBoth} onClick={mockOnClick} />);

    expect(screen.getByText('Created by')).toBeInTheDocument();
    expect(screen.getByText('Support Team')).toBeInTheDocument();
    expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
  });

  it('prioritizes name over email in support_contact', () => {
    const agentWithNameAndEmail = {
      ...mockAgent,
      support_contact: {
        name: 'Support Team',
        email: 'support@example.com',
      },
      authorName: undefined,
    };

    render(<AgentCard agent={agentWithNameAndEmail} onClick={mockOnClick} />);

    expect(screen.getByText('Created by')).toBeInTheDocument();
    expect(screen.getByText('Support Team')).toBeInTheDocument();
    expect(screen.queryByText('support@example.com')).not.toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    render(<AgentCard agent={mockAgent} onClick={mockOnClick} />);

    const card = screen.getByRole('button');
    expect(card).toHaveAttribute('tabIndex', '0');
    expect(card).toHaveAttribute('aria-label', 'com_agents_agent_card_label');
  });
});
