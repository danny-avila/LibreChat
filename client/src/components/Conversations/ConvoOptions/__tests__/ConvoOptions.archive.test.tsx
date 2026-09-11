import React from 'react';
import { Provider, createStore } from 'jotai';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import { chatFilterStatusAtom } from '../../chatFilters';
import ConvoOptions from '../ConvoOptions';

const mockArchiveMutate = jest.fn();
const mockNavigate = jest.fn();
const mockNewConversation = jest.fn();
const mockRetainView = jest.fn();
const mockSetIsPopoverActive = jest.fn();

jest.mock('@ariakit/react', () => ({
  MenuButton: jest
    .requireActual('react')
    .forwardRef(
      (
        { children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>,
        ref: React.ForwardedRef<HTMLButtonElement>,
      ) => (
        <button ref={ref} {...props}>
          {children}
        </button>
      ),
    ),
}));
jest.mock('~/utils', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
}));
jest.mock('librechat-data-provider', () => ({
  QueryKeys: { messages: 'messages' },
  PermissionTypes: { SHARED_LINKS: 'shared_links' },
  Permissions: { CREATE: 'create' },
}));
jest.mock('@librechat/client', () => ({
  DropdownPopup: ({
    trigger,
    items,
  }: {
    trigger: React.ReactNode;
    items: Array<{ label: string; onClick: () => void }>;
  }) => (
    <>
      {trigger}
      {items
        .filter((item) => item.label === 'com_ui_archive' || item.label === 'com_ui_unarchive')
        .map((item) => (
          <button key={item.label} type="button" onClick={item.onClick}>
            {item.label}
          </button>
        ))}
    </>
  ),
  Spinner: () => <span role="status" />,
  buttonVariants: () => '',
  useToastContext: () => ({ showToast: jest.fn() }),
  useMediaQuery: () => false,
}));

jest.mock('~/data-provider', () => ({
  useDuplicateConversationMutation: () => ({ mutate: jest.fn(), isLoading: false }),
  useAssignConversationToProjectMutation: () => ({ mutate: jest.fn(), isLoading: false }),
  useDeleteConversationMutation: () => ({ mutate: jest.fn(), isLoading: false }),
  useGetStartupConfig: () => ({ data: { sharedLinksEnabled: false } }),
  useArchiveConvoMutation: () => ({ mutate: mockArchiveMutate, isLoading: false }),
  usePinConversationMutation: () => ({ mutate: jest.fn(), isLoading: false }),
}));

jest.mock('~/hooks', () => ({
  useHasAccess: () => true,
  useLocalize: () => (key: string) => key,
  useNavigateToConvo: () => ({ navigateToConvo: jest.fn() }),
  useNewConvo: () => ({ newConversation: mockNewConversation }),
}));

jest.mock('~/Providers', () => ({
  useChatContext: () => ({ index: 0 }),
}));

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

jest.mock('../ProjectButton', () => () => null);
jest.mock('../DeleteButton', () => () => null);
jest.mock('../ShareButton', () => () => null);

const renderOptions = (status: 'active' | 'archived') => {
  const jotaiStore = createStore();
  jotaiStore.set(chatFilterStatusAtom, status);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props = {
    conversationId: 'conversation-1',
    title: 'A conversation',
    retainView: mockRetainView,
    renameHandler: jest.fn(),
    isPopoverActive: false,
    setIsPopoverActive: mockSetIsPopoverActive,
    isActiveConvo: false,
  };

  render(
    <QueryClientProvider client={queryClient}>
      <Provider store={jotaiStore}>
        <MemoryRouter initialEntries={['/c/conversation-1']}>
          <Routes>
            <Route path="/c/:conversationId" element={<ConvoOptions {...props} />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    </QueryClientProvider>,
  );
};

describe('ConvoOptions archive action', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockArchiveMutate.mockReset();
    mockNavigate.mockReset();
    mockNewConversation.mockReset();
    mockRetainView.mockReset();
    mockSetIsPopoverActive.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('restores the open archived conversation without navigating away', () => {
    renderOptions('archived');

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_unarchive' }));

    expect(mockArchiveMutate).toHaveBeenCalledWith(
      { conversationId: 'conversation-1', isArchived: false },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    const [, callbacks] = mockArchiveMutate.mock.calls[0];
    act(() => callbacks.onSuccess());
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockNewConversation).not.toHaveBeenCalled();
  });

  it('archives the open active conversation and navigates to a new chat', () => {
    renderOptions('active');

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_archive' }));

    expect(mockArchiveMutate).toHaveBeenCalledWith(
      { conversationId: 'conversation-1', isArchived: true },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    const [, callbacks] = mockArchiveMutate.mock.calls[0];
    act(() => callbacks.onSuccess());
    expect(mockNewConversation).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/c/new', { replace: true });
  });
});
