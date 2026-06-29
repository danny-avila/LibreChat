import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import AgentDetailContent from '../AgentDetailContent';

jest.mock('librechat-data-provider', () => ({
  QueryKeys: {
    agents: 'agents',
    messages: 'messages',
  },
  Constants: {
    NEW_CONVO: 'new',
  },
  EModelEndpoint: {
    agents: 'agents',
  },
  PermissionBits: {
    EDIT: 2,
  },
  LocalStorageKeys: {
    AGENT_ID_PREFIX: 'agent:',
  },
}));

jest.mock(
  '@librechat/client',
  () => ({
    OGDialogContent: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="dialog-content">{children}</div>
    ),
    Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    ),
    useToastContext: () => ({
      showToast: jest.fn(),
    }),
  }),
  { virtual: true },
);

jest.mock('~/hooks', () => ({
  useDefaultConvo: () => jest.fn((value) => value.conversation),
  useFavorites: () => ({
    isFavoriteAgent: jest.fn(() => false),
    toggleFavoriteAgent: jest.fn(),
  }),
  useLocalize: () => (key: string, values?: Record<string, string>) => {
    const translations: Record<string, string> = {
      com_agents_contact: 'Contact',
      com_agents_no_contact_available: 'No contact available',
      com_agents_loading: 'Loading',
      com_agents_link_copied: 'Link copied',
      com_agents_link_copy_failed: 'Link copy failed',
      com_agents_start_chat: 'Start chat',
      com_agents_chat_with: `Chat with ${values?.name ?? ''}`,
      com_ui_agent: 'Agent',
      com_ui_pin: 'Pin',
      com_ui_unpin: 'Unpin',
      com_agents_copy_link: 'Copy link',
    };
    return translations[key] || key;
  },
}));

jest.mock('~/Providers', () => ({
  useChatContext: () => ({
    conversation: undefined,
    newConversation: jest.fn(),
  }),
}));

jest.mock('~/utils', () => ({
  cn: (...classes: string[]) => classes.filter(Boolean).join(' '),
  clearMessagesCache: jest.fn(),
  renderAgentAvatar: () => <div data-testid="agent-avatar" />,
}));

const renderWithClient = (children: React.ReactNode) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
};

const baseAgent = {
  id: 'agent-1',
  name: 'Agent One',
  description: 'Agent description',
  provider: 'openai',
  model: 'gpt-4',
  model_parameters: {},
};

describe('AgentDetailContent', () => {
  it('renders support contact with mailto link', () => {
    renderWithClient(
      <AgentDetailContent
        agent={
          {
            ...baseAgent,
            support_contact: { name: 'Support Team', email: 'support@example.com' },
            owner_contact: { name: 'Owner User', email: 'owner@example.com' },
          } as any
        }
      />,
    );

    expect(screen.getByText('Contact:')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Support Team' })).toHaveAttribute(
      'href',
      'mailto:support@example.com',
    );
    expect(screen.queryByText('Owner User')).not.toBeInTheDocument();
  });

  it('falls back to owner contact when support contact is missing', () => {
    renderWithClient(
      <AgentDetailContent
        agent={
          {
            ...baseAgent,
            owner_contact: { name: 'Owner User', email: 'owner@example.com' },
          } as any
        }
      />,
    );

    expect(screen.getByRole('link', { name: 'Owner User' })).toHaveAttribute(
      'href',
      'mailto:owner@example.com',
    );
  });
});
