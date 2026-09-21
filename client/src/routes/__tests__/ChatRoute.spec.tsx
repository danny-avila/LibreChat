import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Constants, EModelEndpoint, LocalStorageKeys } from 'librechat-data-provider';
import type {
  TAgentsMap,
  TConversation,
  TEndpointsConfig,
  TStartupConfig,
} from 'librechat-data-provider';
import ChatRoute from '../ChatRoute';

const mockNewConversation = jest.fn();
const mockHasSetConversation = { current: false };
let mockConversation: TConversation | null = null;
let mockAgentsMap: TAgentsMap | undefined;
let mockAuthenticated = true;
let mockRolesLoaded = true;
let mockStartupConfig: TStartupConfig | undefined;
let mockEndpoints: TEndpointsConfig | undefined;
let mockModelsInitial = false;
let mockAgentsError = false;
let mockConvoError = false;

/** Keep the route's real selection predicates and effect; isolate unrelated startup side effects. */
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useAssistantListMap: () => ({}),
  useIdChangeEffect: jest.fn(),
  useAppStartup: jest.fn(),
  useNewConvo: () => ({ newConversation: mockNewConversation }),
}));
jest.mock('../useAuthRedirect', () => ({
  __esModule: true,
  default: () => ({
    isAuthenticated: mockAuthenticated,
    roles: mockRolesLoaded ? { USER: {} } : {},
  }),
}));
jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: mockStartupConfig }),
  useGetEndpointsQuery: () => ({ data: mockEndpoints, isLoading: mockEndpoints == null }),
  useGetConvoIdQuery: () => ({ isError: mockConvoError, error: { response: { status: 404 } } }),
  useListAgentsQuery: () => ({ isError: mockAgentsError }),
  useProjectQuery: () => ({ isLoading: false }),
}));
jest.mock('librechat-data-provider/react-query', () => ({
  useGetModelsQuery: () => ({ data: { initial: mockModelsInitial }, isLoading: false }),
}));
jest.mock('~/Providers', () => ({
  useAgentsMapContext: () => mockAgentsMap,
  ToolCallsMapProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    useCreateConversationAtom: () => ({
      conversation: mockConversation,
      hasSetConversation: mockHasSetConversation,
    }),
  },
}));
jest.mock('~/utils', () => ({
  ...jest.requireActual('~/utils/endpoints'),
  ...jest.requireActual('~/utils/createChatSearchParams'),
  isNotFoundError: () => mockConvoError,
  isTemporaryConversation: () => false,
  clearMessagesCache: jest.fn(),
  logger: { log: jest.fn() },
}));
jest.mock('@librechat/client', () => ({
  Spinner: () => <div data-testid="spinner" />,
  Skeleton: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
  useToastContext: () => ({ showToast: jest.fn() }),
}));
jest.mock('~/components/Chat/Menus/OpenSidebar', () => ({
  __esModule: true,
  default: () => <button aria-label="com_nav_open_sidebar" />,
}));
jest.mock('~/components/Chat/ChatView', () => ({
  __esModule: true,
  default: () => <main data-testid="chat-view" />,
}));

const storedPick = JSON.stringify({ endpoint: EModelEndpoint.agents, agent_id: 'agent_saved' });
const storageKey = `${LocalStorageKeys.LAST_CONVO_SETUP}_0`;

function renderRoute(path = '/c/new') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <RecoilRoot>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/c/:conversationId?" element={children} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </RecoilRoot>
    );
  }
  return render(<ChatRoute />, { wrapper: Wrapper });
}

beforeEach(() => {
  localStorage.clear();
  mockConversation = null;
  mockHasSetConversation.current = false;
  mockAgentsMap = undefined;
  mockAuthenticated = true;
  mockRolesLoaded = true;
  mockModelsInitial = false;
  mockAgentsError = false;
  mockConvoError = false;
  mockEndpoints = { [EModelEndpoint.agents]: { order: 0 } };
  mockStartupConfig = {
    interface: { modelSelect: true },
    modelSpecs: {
      list: [
        {
          name: 'soft',
          label: 'Soft',
          softDefault: true,
          preset: { endpoint: EModelEndpoint.agents, agent_id: 'agent_default' },
        },
      ],
    },
  } as TStartupConfig;
  localStorage.setItem(storageKey, storedPick);
});

describe('ChatRoute startup frame', () => {
  it.each(['endpoints', 'config', 'models', 'roles', 'agents'] as const)(
    'shows the loading frame while %s are pending without choosing a temporary model',
    (pending) => {
      if (pending === 'endpoints') mockEndpoints = undefined;
      if (pending === 'config') mockStartupConfig = undefined;
      if (pending === 'models') mockModelsInitial = true;
      if (pending === 'roles') mockRolesLoaded = false;

      renderRoute();

      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('com_ui_loading');
      expect(screen.getByRole('button', { name: 'com_nav_open_sidebar' })).toBeInTheDocument();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.queryByTestId('chat-view')).not.toBeInTheDocument();
      expect(mockNewConversation).not.toHaveBeenCalled();
      expect(localStorage.getItem(storageKey)).toBe(storedPick);
    },
  );

  it('keeps one frame mounted as endpoints settle but the catalog remains pending', () => {
    mockEndpoints = undefined;
    const { rerender } = renderRoute();
    const frame = screen.getByRole('main');
    mockEndpoints = { [EModelEndpoint.agents]: { order: 0 } };
    rerender(<ChatRoute />);
    expect(screen.getByRole('main')).toBe(frame);
    expect(mockNewConversation).not.toHaveBeenCalled();
  });

  it('replaces the frame with the chat only after a conversation exists', () => {
    const { rerender } = renderRoute();
    expect(screen.getByRole('status')).toBeInTheDocument();
    mockConversation = { conversationId: Constants.NEW_CONVO } as TConversation;
    mockHasSetConversation.current = true;
    rerender(<ChatRoute />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByTestId('chat-view')).toBeInTheDocument();
  });

  it('retains the soft-default fallback when the catalog confirms the agent is missing', () => {
    const { rerender } = renderRoute();
    mockAgentsMap = {};
    rerender(<ChatRoute />);
    expect(mockNewConversation).toHaveBeenCalledTimes(1);
    expect(mockNewConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        preset: expect.objectContaining({ spec: 'soft', agent_id: 'agent_default' }),
      }),
    );
  });

  it('retains the stored selection on a transient catalog failure', () => {
    const { rerender } = renderRoute();
    mockAgentsError = true;
    rerender(<ChatRoute />);
    expect(mockNewConversation).toHaveBeenCalledTimes(1);
    expect(mockNewConversation.mock.calls[0][0]).not.toHaveProperty('preset');
    expect(localStorage.getItem(storageKey)).toBe(storedPick);
  });

  it('does not delay an explicit URL selection for the catalog', () => {
    renderRoute('/c/new?agent_id=agent_explicit&endpoint=agents');
    expect(mockNewConversation).toHaveBeenCalledWith(
      expect.objectContaining({ preset: expect.objectContaining({ agent_id: 'agent_explicit' }) }),
    );
  });

  it('shows the frame on a cold existing-conversation load', () => {
    renderRoute('/c/existing');
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(mockNewConversation).not.toHaveBeenCalled();
  });

  it('keeps the missing-conversation fallback gated on the catalog', () => {
    mockConvoError = true;
    renderRoute('/c/missing');
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(mockNewConversation).not.toHaveBeenCalled();
  });

  it.each(['/c/new', '/c'])('does not paint a frame before authentication at %s', (path) => {
    mockAuthenticated = false;
    mockEndpoints = undefined;
    const { container } = renderRoute(path);
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps an initialized conversation visible during catalog refresh', () => {
    mockConversation = { conversationId: Constants.NEW_CONVO } as TConversation;
    mockHasSetConversation.current = true;
    renderRoute();
    expect(screen.getByTestId('chat-view')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(mockNewConversation).not.toHaveBeenCalled();
  });

  it('does not wait for the catalog for a fresh visitor', () => {
    localStorage.removeItem(storageKey);
    renderRoute();
    expect(mockNewConversation).toHaveBeenCalledTimes(1);
    expect(mockNewConversation).toHaveBeenCalledWith(
      expect.objectContaining({ preset: expect.objectContaining({ spec: 'soft' }) }),
    );
  });

  it('renders nothing when the route has no conversation ID', () => {
    const { container } = renderRoute('/c');
    expect(container).toBeEmptyDOMElement();
  });

  it('preserves the search empty state', () => {
    mockConversation = { conversationId: Constants.SEARCH } as TConversation;
    const { container } = renderRoute('/c/search');
    expect(container).toBeEmptyDOMElement();
  });
});
