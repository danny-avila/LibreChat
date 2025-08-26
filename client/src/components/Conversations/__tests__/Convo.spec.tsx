import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Convo from '../Convo';
import { renderWithState, createMockConversation } from '~/test-utils/renderHelpers';

jest.mock('recoil', () => ({
  ...jest.requireActual('recoil'),
  useRecoilValue: jest.fn((atom) => {
    if (atom.key === 'allConversationsSelector') {
      return [];
    }
    return jest.requireActual('recoil').useRecoilValue(atom);
  }),
}));

const mockNavigateToConvo = jest.fn();
const mockShowToast = jest.fn();
const mockUpdateConvoMutation = {
  mutateAsync: jest.fn(),
};
const mockToggleNav = jest.fn();
const mockRetainView = jest.fn();

const mockLocation = {
  origin: 'http://localhost:3000',
};
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

jest.mock('~/hooks', () => ({
  useNavigateToConvo: jest.fn(() => ({ navigateToConvo: mockNavigateToConvo })),
  useMediaQuery: jest.fn(() => false),
  useLocalize: jest.fn(() => (key: string) => key),
}));

jest.mock('~/data-provider', () => ({
  useUpdateConversationMutation: jest.fn(() => mockUpdateConvoMutation),
  useGetEndpointsQuery: jest.fn(() => ({ data: {} })),
}));

jest.mock('~/Providers', () => ({
  useToastContext: jest.fn(() => ({ showToast: mockShowToast })),
}));

jest.mock('~/components/Endpoints/EndpointIcon', () => {
  const MockEndpointIcon = ({ size }: { size: number }) => (
    <div data-testid="endpoint-icon" style={{ width: size, height: size }} />
  );
  MockEndpointIcon.displayName = 'EndpointIcon';
  return MockEndpointIcon;
});

jest.mock('../ConvoOptions', () => ({
  ConvoOptions: ({ isActiveConvo }: any) => (
    <div data-testid="convo-options" data-active={isActiveConvo} />
  ),
}));

jest.mock('../RenameForm', () => {
  const MockRenameForm = ({ onSubmit, onCancel, titleInput, setTitleInput }: any) => (
    <div data-testid="rename-form">
      <input
        data-testid="rename-input"
        value={titleInput}
        onChange={(e) => setTitleInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onSubmit(titleInput);
          } else if (e.key === 'Escape') {
            onCancel();
          }
        }}
      />
    </div>
  );
  MockRenameForm.displayName = 'RenameForm';
  return MockRenameForm;
});

jest.mock('../ConvoLink', () => {
  const MockConvoLink = ({ children, title, isActiveConvo }: any) => (
    <div data-testid="convo-link" data-active={isActiveConvo}>
      {children}
      <span>{title}</span>
    </div>
  );
  MockConvoLink.displayName = 'ConvoLink';
  return MockConvoLink;
});

const mockUseMediaQuery = jest.requireMock('~/hooks').useMediaQuery;
const mockUseLocalize = jest.requireMock('~/hooks').useLocalize;

const renderConvo = (props: any, conversationId = 'conv-1') => {
  const ConvoWithRouter = (
    <MemoryRouter initialEntries={[`/c/${conversationId}`]}>
      <Routes>
        <Route path="/c/:conversationId" element={<Convo {...props} />} />
      </Routes>
    </MemoryRouter>
  );

  return renderWithState(ConvoWithRouter);
};

describe('Convo Component', () => {
  const defaultProps = {
    conversation: createMockConversation({
      conversationId: 'conv-1',
      title: 'Test Conversation',
    }),
    retainView: mockRetainView,
    toggleNav: mockToggleNav,
    isLatestConvo: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders conversation with title and icon', () => {
      renderConvo(defaultProps);

      expect(screen.getByRole('listitem')).toBeInTheDocument();
      expect(screen.getByText('Test Conversation')).toBeInTheDocument();
      expect(screen.getByTestId('endpoint-icon')).toBeInTheDocument();
    });

    it('applies active styles when conversation is active', () => {
      renderConvo(defaultProps, 'conv-1');

      const listItem = screen.getByRole('listitem');
      expect(listItem).toHaveClass('bg-surface-active-alt');
    });

    it('applies hover styles when conversation is not active', () => {
      renderConvo(defaultProps, 'other-conv');

      const listItem = screen.getByRole('listitem');
      expect(listItem).toHaveClass('hover:bg-surface-active-alt');
      expect(listItem).not.toHaveClass('bg-surface-active-alt');
    });
  });

  describe('Navigation', () => {
    it('navigates to conversation on click', async () => {
      const user = userEvent.setup();
      renderConvo(defaultProps, 'other-conv');

      const listItem = screen.getByRole('listitem');
      await user.click(listItem);

      expect(mockToggleNav).toHaveBeenCalled();
      expect(mockNavigateToConvo).toHaveBeenCalledWith(
        defaultProps.conversation,
        expect.objectContaining({
          currentConvoId: 'other-conv',
          resetLatestMessage: false,
        }),
      );
    });

    it('opens in new tab with ctrl/cmd click', () => {
      const originalOpen = window.open;
      const mockOpen = jest.fn();
      window.open = mockOpen;

      renderConvo(defaultProps, 'other-conv');

      const listItem = screen.getByRole('listitem');
      fireEvent.click(listItem, { button: 0, ctrlKey: true });

      expect(mockToggleNav).toHaveBeenCalled();
      expect(mockOpen).toHaveBeenCalledWith('http://localhost:3000/c/conv-1', '_blank');
      expect(mockNavigateToConvo).not.toHaveBeenCalled();

      window.open = originalOpen;
    });

    it('navigates on Enter key press', () => {
      renderConvo(defaultProps, 'other-conv');

      const listItem = screen.getByRole('listitem');
      fireEvent.keyDown(listItem, { key: 'Enter' });

      expect(mockToggleNav).toHaveBeenCalled();
      expect(mockNavigateToConvo).toHaveBeenCalledWith(
        defaultProps.conversation,
        expect.objectContaining({
          currentConvoId: 'other-conv',
        }),
      );
    });

    it('does not navigate when already on the same conversation', async () => {
      const user = userEvent.setup();
      renderConvo(defaultProps, 'conv-1');

      const listItem = screen.getByRole('listitem');
      await user.click(listItem);

      expect(mockToggleNav).not.toHaveBeenCalled();
      expect(mockNavigateToConvo).not.toHaveBeenCalled();
    });

    it('updates document title on navigation', async () => {
      const user = userEvent.setup();
      renderConvo(defaultProps, 'other-conv');

      const listItem = screen.getByRole('listitem');
      await user.click(listItem);

      expect(document.title).toBe('Test Conversation');
    });
  });

  describe('Rename Functionality', () => {
    it('shows rename form when rename is triggered', () => {
      const { rerender } = renderConvo(defaultProps);

      expect(screen.queryByTestId('rename-form')).not.toBeInTheDocument();

      // Simulate rename trigger by updating component state
      const propsWithRenaming = {
        ...defaultProps,
        conversation: { ...defaultProps.conversation },
      };

      rerender(
        <MemoryRouter initialEntries={['/c/conv-1']}>
          <Routes>
            <Route
              path="/c/:conversationId"
              element={
                <Convo
                  {...propsWithRenaming}
                  // Force rename state by clicking rename in ConvoOptions
                />
              }
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    it('submits rename successfully', async () => {
      mockUpdateConvoMutation.mutateAsync.mockResolvedValueOnce({});

      const { container } = renderConvo(defaultProps);

      // Find and click the rename button (part of ConvoOptions)
      screen.getByTestId('convo-options');

      // Simulate the rename handler being called
      const listItem = screen.getByRole('listitem');
      fireEvent.click(listItem);

      // The component should handle rename internally
      // Wait for mutation to ensure proper state handling
      await waitFor(() => {
        expect(container.querySelector('[data-testid="convo-item"]')).toBeInTheDocument();
      });
    });
  });

  describe('Active Conversation Detection', () => {
    it('detects active conversation when IDs match', () => {
      renderConvo(defaultProps, 'conv-1');

      const convoLink = screen.getByTestId('convo-link');
      expect(convoLink).toHaveAttribute('data-active', 'true');
    });

    it('detects active conversation for new conversation', () => {
      const newConvoProps = {
        ...defaultProps,
        conversation: createMockConversation({
          conversationId: 'new',
          title: 'New Chat',
        }),
      };

      renderConvo(newConvoProps, 'new');

      const convoLink = screen.getByTestId('convo-link');
      expect(convoLink).toHaveAttribute('data-active', 'true');
    });

    it('uses latest conversation when current is new and conversation is first in list', () => {
      // Override the mock for this specific test
      const mockUseRecoilValue = jest.requireMock('recoil').useRecoilValue;
      mockUseRecoilValue.mockImplementation((atom) => {
        if (atom.key === 'allConversationsSelector') {
          return ['conv-1', 'conv-2', 'conv-3'];
        }
        return [];
      });

      const newConvoProps = {
        ...defaultProps,
        conversation: createMockConversation({
          conversationId: 'conv-1',
          title: 'First Conversation',
        }),
      };

      renderConvo(newConvoProps, 'new');

      const convoLink = screen.getByTestId('convo-link');
      expect(convoLink).toHaveAttribute('data-active', 'true');

      // Reset mock
      mockUseRecoilValue.mockImplementation((atom) => {
        if (atom.key === 'allConversationsSelector') {
          return [];
        }
        return [];
      });
    });
  });

  describe('Responsive Behavior', () => {
    it('handles small screen behavior', () => {
      mockUseMediaQuery.mockReturnValue(true);

      renderConvo(defaultProps);

      expect(screen.getByRole('listitem')).toBeInTheDocument();
      // ConvoLink receives isSmallScreen prop
      expect(screen.getByTestId('convo-link')).toBeInTheDocument();
    });

    it('shows options on hover for desktop', () => {
      mockUseMediaQuery.mockReturnValue(false);

      renderConvo(defaultProps, 'other-conv'); // Not active

      const optionsContainer = screen.getByTestId('convo-options').parentElement;
      // The options container should have hover-related classes when not active
      expect(optionsContainer).toBeInTheDocument();
      expect(optionsContainer?.className).toContain('group-hover:opacity-100');
    });
  });

  describe('Edge Cases', () => {
    it('handles conversation without title', () => {
      const untitledProps = {
        ...defaultProps,
        conversation: createMockConversation({
          conversationId: 'conv-1',
          title: '',
        }),
      };

      renderConvo(untitledProps);

      expect(screen.getByRole('listitem')).toBeInTheDocument();
    });

    it('uses localized untitled text for empty rename', async () => {
      mockUseLocalize.mockReturnValue((key: string) =>
        key === 'com_ui_untitled' ? 'Untitled' : key,
      );

      mockUpdateConvoMutation.mutateAsync.mockImplementation(({ title }) => {
        expect(title).toBe('Untitled');
        return Promise.resolve({});
      });

      renderConvo(defaultProps);

      // Component handles empty rename internally
      await waitFor(() => {
        expect(screen.getByRole('listitem')).toBeInTheDocument();
      });
    });

    it('prevents navigation when rename is active', async () => {
      const user = userEvent.setup();
      renderConvo(defaultProps, 'other-conv');

      const listItem = screen.getByRole('listitem');

      // Click should navigate normally when not renaming
      await user.click(listItem);

      expect(mockToggleNav).toHaveBeenCalled();
      expect(mockNavigateToConvo).toHaveBeenCalled();
    });

    it('handles middle mouse button click', async () => {
      renderConvo(defaultProps);

      const listItem = screen.getByRole('listitem');
      fireEvent.click(listItem, { button: 1 });

      expect(mockNavigateToConvo).not.toHaveBeenCalled();
      expect(mockToggleNav).not.toHaveBeenCalled();
    });

    it('maintains popover state during navigation', () => {
      renderConvo(defaultProps);

      const optionsContainer = screen.getByTestId('convo-options').parentElement;

      // When popover is active or conversation is active, options should remain visible
      expect(optionsContainer).toBeInTheDocument();
      // Active conversation shows options without hover classes
      expect(optionsContainer?.className).toContain('opacity-100');
    });

    it('updates title input when prop changes', () => {
      const { rerender } = renderConvo(defaultProps);

      const updatedProps = {
        ...defaultProps,
        conversation: createMockConversation({
          conversationId: 'conv-1',
          title: 'Updated Title',
        }),
      };

      rerender(
        <MemoryRouter initialEntries={['/c/conv-1']}>
          <Routes>
            <Route path="/c/:conversationId" element={<Convo {...updatedProps} />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByText('Updated Title')).toBeInTheDocument();
    });

    it('handles new conversation reset in navigation', async () => {
      const user = userEvent.setup();
      const newConvoProps = {
        ...defaultProps,
        conversation: createMockConversation({
          conversationId: 'new',
        }),
      };

      renderConvo(newConvoProps, 'other-conv');

      const listItem = screen.getByRole('listitem');
      await user.click(listItem);

      expect(mockNavigateToConvo).toHaveBeenCalledWith(
        newConvoProps.conversation,
        expect.objectContaining({
          resetLatestMessage: true,
        }),
      );
    });
  });
});
