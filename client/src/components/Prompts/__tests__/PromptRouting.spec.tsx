/* eslint-disable i18next/no-literal-string */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, Link, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecoilRoot } from 'recoil';

if (typeof Request === 'undefined') {
  global.Request = class Request {
    constructor(
      public url: string,
      public init?: RequestInit,
    ) {}
  } as unknown as typeof Request;
}

jest.mock('~/hooks', () => ({
  useLocalize: jest.fn(() => (key: string) => key),
  useHasAccess: jest.fn(() => true),
  useCustomLink: jest.fn(() => jest.fn()),
  useAuthContext: jest.fn(() => ({ isAuthenticated: true, user: { name: 'Test User' } })),
  TranslationKeys: {},
}));

jest.mock('~/Providers', () => ({
  PromptGroupsProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  usePromptGroupsContext: jest.fn(() => ({
    hasAccess: true,
    promptGroups: [],
    groupsQuery: { data: [], isLoading: false, isFetching: false },
    nextPage: jest.fn(),
    prevPage: jest.fn(),
    hasNextPage: false,
    hasPreviousPage: false,
    allPromptGroups: { data: undefined, isLoading: false },
  })),
}));

jest.mock('~/data-provider', () => ({
  useGetPrompts: jest.fn(() => ({ data: [], isLoading: false })),
  useGetPromptGroup: jest.fn(() => ({ data: null, isLoading: false })),
  useCreatePrompt: jest.fn(() => ({ mutate: jest.fn(), isLoading: false })),
  useAddPromptToGroup: jest.fn(() => ({ mutate: jest.fn(), isLoading: false })),
  useUpdatePromptGroup: jest.fn(() => ({ mutate: jest.fn(), isLoading: false })),
  useMakePromptProduction: jest.fn(() => ({ mutate: jest.fn(), isLoading: false })),
  useGetStartupConfig: jest.fn(() => ({ data: null })),
}));

jest.mock('~/components/Chat/Footer', () => {
  return function MockFooter() {
    return <div data-testid="footer">Footer</div>;
  };
});

function MockCreateForm() {
  return <div data-testid="create-prompt-form">Create Prompt</div>;
}

function MockEditForm() {
  const { promptId } = useParams();
  return <div data-testid="prompt-form">Edit Prompt: {promptId}</div>;
}

jest.mock('~/components/Prompts/Groups/CreatePromptForm', () => MockCreateForm);
jest.mock('~/components/Prompts/PromptForm', () => MockEditForm);

import PromptEditorView from '~/components/Prompts/PromptEditorView';

function SidebarWithLinks() {
  return (
    <nav data-testid="sidebar">
      <Link to="/prompts/new" data-testid="create-link">
        Create Prompt
      </Link>
      <Link to="/prompts/group123" data-testid="edit-link">
        Edit Prompt
      </Link>
      <Link to="/c/new" data-testid="chat-link">
        Chat
      </Link>
    </nav>
  );
}

function ChatLanding() {
  return <div data-testid="chat-landing">Chat Landing Page</div>;
}

function createAppRouter(initialPath: string) {
  return createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <div>
            <SidebarWithLinks />
            <div data-testid="main-content" />
          </div>
        ),
      },
      {
        path: '/c/new',
        element: (
          <div>
            <SidebarWithLinks />
            <ChatLanding />
          </div>
        ),
      },
      {
        path: '/prompts/new',
        element: (
          <div>
            <SidebarWithLinks />
            <PromptEditorView />
          </div>
        ),
      },
      {
        path: '/prompts/:promptId',
        element: (
          <div>
            <SidebarWithLinks />
            <PromptEditorView />
          </div>
        ),
      },
    ],
    { initialEntries: [initialPath] },
  );
}

function renderApp(initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createAppRouter(initialPath);
  return render(
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>
        <RouterProvider router={router} />
      </RecoilRoot>
    </QueryClientProvider>,
  );
}

describe('Prompt editor routing integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('navigates from chat landing to create prompt', async () => {
    renderApp('/c/new');

    expect(screen.getByTestId('chat-landing')).toBeInTheDocument();
    expect(screen.queryByTestId('prompt-editor-view')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('create-link'));

    await waitFor(() => {
      expect(screen.getByTestId('prompt-editor-view')).toBeInTheDocument();
    });
    expect(screen.getByTestId('create-prompt-form')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-landing')).not.toBeInTheDocument();
  });

  it('navigates from chat landing to edit prompt', async () => {
    renderApp('/c/new');

    fireEvent.click(screen.getByTestId('edit-link'));

    await waitFor(() => {
      expect(screen.getByTestId('prompt-editor-view')).toBeInTheDocument();
    });
    expect(screen.getByTestId('prompt-form')).toBeInTheDocument();
    expect(screen.getByText('Edit Prompt: group123')).toBeInTheDocument();
  });

  it('navigates from prompt editor back to chat', async () => {
    renderApp('/prompts/new');

    expect(screen.getByTestId('create-prompt-form')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('chat-link'));

    await waitFor(() => {
      expect(screen.getByTestId('chat-landing')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('prompt-editor-view')).not.toBeInTheDocument();
  });

  it('preserves the sidebar when showing prompt editor', async () => {
    renderApp('/prompts/new');

    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('prompt-editor-view')).toBeInTheDocument();
  });

  it('renders prompt editor in the main content area', async () => {
    renderApp('/prompts/abc456');

    const editorView = screen.getByTestId('prompt-editor-view');
    expect(editorView).toBeInTheDocument();
    expect(editorView.querySelector('[role="main"]')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });
});
