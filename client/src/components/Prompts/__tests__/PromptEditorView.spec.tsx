/* eslint-disable i18next/no-literal-string */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
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

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

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

jest.mock('~/components/Prompts/Groups/CreatePromptForm', () => {
  return function MockCreatePromptForm() {
    return <div data-testid="create-prompt-form">Create Prompt Form</div>;
  };
});

jest.mock('~/components/Prompts/PromptForm', () => {
  return function MockPromptForm() {
    return <div data-testid="prompt-form">Edit Prompt Form</div>;
  };
});

import PromptEditorView from '../PromptEditorView';

function createTestRouter(initialPath: string) {
  return createMemoryRouter(
    [
      {
        path: '/prompts/new',
        element: <PromptEditorView />,
      },
      {
        path: '/prompts/:promptId',
        element: <PromptEditorView />,
      },
    ],
    { initialEntries: [initialPath] },
  );
}

function renderWithProviders(router: ReturnType<typeof createMemoryRouter>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>
        <RouterProvider router={router} />
      </RecoilRoot>
    </QueryClientProvider>,
  );
}

describe('PromptEditorView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the create prompt form when navigating to /prompts/new', async () => {
    const router = createTestRouter('/prompts/new');
    renderWithProviders(router);

    await waitFor(() => {
      expect(screen.getByTestId('prompt-editor-view')).toBeInTheDocument();
    });
    expect(screen.getByTestId('create-prompt-form')).toBeInTheDocument();
    expect(screen.queryByTestId('prompt-form')).not.toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });

  it('renders the edit prompt form when navigating to /prompts/:promptId', async () => {
    const router = createTestRouter('/prompts/abc123');
    renderWithProviders(router);

    await waitFor(() => {
      expect(screen.getByTestId('prompt-editor-view')).toBeInTheDocument();
    });
    expect(screen.getByTestId('prompt-form')).toBeInTheDocument();
    expect(screen.queryByTestId('create-prompt-form')).not.toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });

  it('renders with main role for accessibility', async () => {
    const router = createTestRouter('/prompts/new');
    renderWithProviders(router);

    await waitFor(() => {
      expect(screen.getByRole('main')).toBeInTheDocument();
    });
  });

  it('has the bg-presentation class on the wrapper', async () => {
    const router = createTestRouter('/prompts/new');
    renderWithProviders(router);

    await waitFor(() => {
      const view = screen.getByTestId('prompt-editor-view');
      expect(view.classList.contains('bg-presentation')).toBe(true);
    });
  });
});
