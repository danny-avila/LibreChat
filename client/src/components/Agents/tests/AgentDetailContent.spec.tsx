import React from 'react';
import { RecoilRoot } from 'recoil';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OGDialog, OGDialogTrigger, useToastContext } from '@librechat/client';
import type t from 'librechat-data-provider';
import '@testing-library/jest-dom';
import AgentDetailContent from '../AgentDetailContent';

const mockToggleFavoriteAgent = jest.fn();
let mockIsFavorite = false;
let mockIsUpdating = false;
const mockOpenerLabel = 'Marketplace opener';
const queryClients = new Set<QueryClient>();

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useToastContext: jest.fn(),
}));

jest.mock('~/hooks', () => ({
  useFavorites: () => ({
    isFavoriteAgent: () => mockIsFavorite,
    toggleFavoriteAgent: mockToggleFavoriteAgent,
    isUpdating: mockIsUpdating,
  }),
  useLocalize: () => (key: string, values?: Record<string, string>) => {
    const translations: Record<string, string> = {
      com_agents_about: 'About this agent',
      com_agents_category_general: 'General',
      com_agents_contact: 'Contact',
      com_agents_copy_link: 'Copy link',
      com_agents_description_empty: 'Learn more about this agent and start a conversation.',
      com_agents_details_hint: 'Explore this agent and choose how to start your conversation.',
      com_agents_link_copied: 'Link copied',
      com_agents_link_copy_failed: 'Link copy failed',
      com_agents_starters_heading: 'Try a conversation starter',
      com_agents_starters_hint:
        'Choose a prompt to open a new chat. You can edit it before sending.',
      com_agents_start_chat: 'Start chat',
      com_ui_agent: 'Agent',
      com_ui_close: 'Close',
      com_ui_pin: 'Pin',
      com_ui_unpin: 'Unpin',
      com_ui_updating: 'Updating...',
      com_agents_chat_with: `Chat with ${values?.name ?? ''}`,
    };
    return translations[key] || key;
  },
  useAgentCategories: () => ({
    categories: [{ value: 'general', label: 'com_agents_category_general' }],
  }),
}));

jest.mock('~/utils', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
  renderAgentAvatar: () => <div data-testid="agent-avatar" />,
}));

const baseAgent: t.Agent = {
  id: 'agent-1',
  name: 'Agent One',
  description: 'Agent description',
  created_at: 0,
  avatar: null,
  provider: 'openai',
  model: 'gpt-4',
  model_parameters: {
    temperature: null,
    maxContextTokens: null,
    max_context_tokens: null,
    max_output_tokens: null,
    top_p: null,
    frequency_penalty: null,
    presence_penalty: null,
  },
};

const LocationProbe = () => {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
};

const DetailDialog = ({ agent = baseAgent }: { agent?: t.Agent }) => {
  const [open, setOpen] = React.useState(true);
  return (
    <OGDialog open={open} onOpenChange={setOpen}>
      <OGDialogTrigger asChild>
        <button type="button">{mockOpenerLabel}</button>
      </OGDialogTrigger>
      {open && <AgentDetailContent agent={agent} />}
    </OGDialog>
  );
};

const renderDetail = (agent = baseAgent, basename = '/app') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClients.add(queryClient);
  const toastContext = { showToast: jest.fn() };
  jest.mocked(useToastContext).mockReturnValue(toastContext);
  const view = render(
    /* The start-chat path drops the parallel conversations a multi-conversation session
       left open, which is Recoil state. */
    <RecoilRoot>
      <MemoryRouter
        basename={basename}
        initialEntries={[`${basename}/agents/all?q=invoice&sort=popular&mine=1`]}
      >
        <QueryClientProvider client={queryClient}>
          <DetailDialog agent={agent} />
          <LocationProbe />
        </QueryClientProvider>
      </MemoryRouter>
    </RecoilRoot>,
  );
  return { ...view, showToast: toastContext.showToast };
};

describe('AgentDetailContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsFavorite = false;
    mockIsUpdating = false;
  });

  afterEach(() => {
    for (const queryClient of queryClients) {
      queryClient.clear();
    }
    queryClients.clear();
  });

  it('renders the public identity, readable description, category, and contact', () => {
    renderDetail({
      ...baseAgent,
      category: 'general',
      support_contact: { name: 'Support Team', email: 'support@example.com' },
      description: 'A readable description\nwith more detail.',
    });

    expect(screen.getByRole('heading', { name: 'Agent One' })).toBeInTheDocument();
    expect(screen.getByTestId('agent-avatar')).toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText(/A readable description/)).toHaveTextContent(
      'A readable description with more detail.',
    );
    expect(screen.getByRole('link', { name: 'Support Team' })).toHaveAttribute(
      'href',
      'mailto:support@example.com',
    );
    expect(screen.queryByText('Contact:')).not.toBeInTheDocument();
  });

  it('uses the public owner name when no support contact is configured', () => {
    renderDetail({
      ...baseAgent,
      owner_contact: { name: 'Owner User' },
    });

    expect(screen.getByText('Owner User')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Owner User' })).not.toBeInTheDocument();
  });

  it('filters empty starters and opens a new editable chat without submitting', async () => {
    const user = userEvent.setup();
    const agent = {
      ...baseAgent,
      id: 'agent / one',
      conversation_starters: [' ', '  Ask about & pricing?  ', '\t'],
    };
    renderDetail(agent);

    expect(screen.getByRole('button', { name: /Ask about & pricing\?/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^\s*$/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Ask about & pricing\?/ }));

    const location = new URL(
      screen.getByTestId('location').textContent ?? '',
      window.location.origin,
    );
    expect(location.pathname).toBe('/c/new');
    expect(location.searchParams.get('endpoint')).toBe('agents');
    expect(location.searchParams.get('agent_id')).toBe('agent / one');
    expect(location.searchParams.get('prompt')).toBe('Ask about & pricing?');
    expect(location.searchParams.has('submit')).toBe(false);
  });

  it('starts a new agent chat through the router without marketplace parameters', async () => {
    const user = userEvent.setup();
    renderDetail({ ...baseAgent, id: 'agent / one' });

    await user.click(screen.getByRole('button', { name: 'Start chat' }));

    const location = new URL(
      screen.getByTestId('location').textContent ?? '',
      window.location.origin,
    );
    expect(location.pathname).toBe('/c/new');
    expect(location.searchParams.get('endpoint')).toBe('agents');
    expect(location.searchParams.get('agent_id')).toBe('agent / one');
    expect(location.searchParams.has('q')).toBe(false);
    expect(location.searchParams.has('sort')).toBe(false);
    expect(location.searchParams.has('mine')).toBe(false);
  });

  it('confirms a copy on the button itself and resets it, without a toast', async () => {
    const user = userEvent.setup();
    const writeText = jest.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const { showToast } = renderDetail({ ...baseAgent, id: 'agent / one' });

    await user.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/app/c/new?endpoint=agents&agent_id=agent+%2F+one`,
      );
    });
    expect(await screen.findByRole('button', { name: 'Link copied' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Link copied');
    expect(showToast).not.toHaveBeenCalled();
    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument(),
      { timeout: 4000 },
    );
  });

  it('reports clipboard failures instead of claiming a copy succeeded', async () => {
    const user = userEvent.setup();
    jest
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValueOnce(new Error('Clipboard unavailable'));
    const { showToast } = renderDetail();

    await user.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith({ message: 'Link copy failed' });
    });
    expect(screen.queryByRole('button', { name: 'Link copied' })).not.toBeInTheDocument();
  });

  it('uses the server-backed favorite state and exposes pending updates', async () => {
    const user = userEvent.setup();
    const first = renderDetail();

    const pinButton = screen.getByRole('button', { name: 'Pin' });
    expect(pinButton).toHaveAttribute('aria-pressed', 'false');
    await user.click(pinButton);
    expect(mockToggleFavoriteAgent).toHaveBeenCalledWith('agent-1');
    first.unmount();

    mockIsFavorite = true;
    mockIsUpdating = true;
    renderDetail();
    expect(screen.getByRole('button', { name: 'Unpin' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Unpin' })).toHaveAttribute('aria-busy', 'true');
  });
  it('dismisses with the localized close control and restores opener focus', async () => {
    const user = userEvent.setup();
    renderDetail();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Agent One' })).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Marketplace opener' })).toHaveFocus();
  });
});
