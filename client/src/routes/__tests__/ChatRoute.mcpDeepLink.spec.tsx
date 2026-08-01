import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import ChatRoute from '../ChatRoute';

const mockUseMCPDeepLink = jest.fn(() => ({
  isOpen: true,
  initialValues: { title: 'Server' },
  onOpenChange: jest.fn(),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({}),
}));

jest.mock('recoil', () => ({
  useRecoilValue: () => false,
  useRecoilCallback: (factory: (callbacks: { set: jest.Mock }) => unknown) => () =>
    factory({ set: jest.fn() }),
}));

jest.mock('@librechat/client', () => ({
  Spinner: () => <div data-testid="spinner" />,
  useToastContext: () => ({ showToast: jest.fn() }),
}));

jest.mock('librechat-data-provider/react-query', () => ({
  useGetModelsQuery: () => ({ data: undefined, isLoading: true }),
}));

jest.mock('~/utils', () => ({
  mergeQuerySettingsWithSpec: jest.fn(),
  processValidSettings: jest.fn(() => ({})),
  getDefaultModelSpec: jest.fn(),
  getModelSpecPreset: jest.fn(),
  isNotFoundError: jest.fn(() => false),
  isTemporaryConversation: jest.fn(() => false),
  logger: { log: jest.fn() },
  clearMessagesCache: jest.fn(),
}));

jest.mock('~/data-provider', () => ({
  useGetConvoIdQuery: () => ({ data: undefined, isError: false }),
  useGetStartupConfig: () => ({ data: undefined }),
  useGetEndpointsQuery: () => ({ data: undefined, isLoading: true }),
  useProjectQuery: () => ({
    data: undefined,
    error: undefined,
    isError: false,
    isLoading: false,
    isSuccess: false,
  }),
}));

jest.mock('~/hooks', () => ({
  useAssistantListMap: () => ({}),
  useIdChangeEffect: jest.fn(),
  useAppStartup: jest.fn(),
  useMCPDeepLink: () => mockUseMCPDeepLink(),
  useNewConvo: () => ({ newConversation: jest.fn() }),
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/Providers', () => ({
  ToolCallsMapProvider: ({ children }: React.PropsWithChildren) => children,
}));

jest.mock('~/components/SidePanel/MCPBuilder/MCPDeepLinkDialog', () => ({
  __esModule: true,
  default: () => <div data-testid="mcp-deep-link-dialog" />,
}));

jest.mock('~/components/Chat/ChatView', () => ({
  __esModule: true,
  default: () => <div data-testid="chat-view" />,
}));

jest.mock('../useAuthRedirect', () => ({
  __esModule: true,
  default: () => ({ isAuthenticated: true, user: {}, roles: { USER: {} } }),
}));

jest.mock('~/store/temporary', () => ({
  __esModule: true,
  default: { defaultTemporaryChat: {}, isTemporary: {} },
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    useCreateConversationAtom: () => ({
      hasSetConversation: { current: false },
      conversation: null,
    }),
  },
}));

describe('ChatRoute MCP deep links', () => {
  it('mounts the deep-link consumer before conversation initialization completes', () => {
    render(
      <MemoryRouter
        initialEntries={['/c/new']}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <Routes>
          <Route path="c/:conversationId" element={<ChatRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(mockUseMCPDeepLink).toHaveBeenCalled();
    expect(screen.getByTestId('mcp-deep-link-dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-view')).not.toBeInTheDocument();
  });
});
