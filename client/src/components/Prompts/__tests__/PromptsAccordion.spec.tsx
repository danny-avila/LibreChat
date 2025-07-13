import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PromptsAccordion from '../PromptsAccordion';
import { renderWithState } from '~/test-utils/renderHelpers';

jest.mock('~/hooks', () => ({
  usePromptGroupsNav: jest.fn(),
  useLocalize: jest.fn(() => (key: string) => key),
  useMediaQuery: jest.fn(() => false),
  useCategories: jest.fn(() => ({ categories: [] })),
}));

jest.mock('~/components/Prompts/Groups/GroupSidePanel', () => {
  const MockGroupSidePanel = ({ children, className, ...props }: any) => (
    <div
      data-testid="group-side-panel"
      className={className}
      data-name={props.name}
      data-pagesize={props.pageSize}
      data-hasnextpage={props.hasNextPage}
      data-haspreviouspage={props.hasPreviousPage}
      data-isfetching={props.isFetching}
      data-groupsquery={props.groupsQuery ? 'exists' : 'null'}
      data-promptgroups={props.promptGroups ? 'exists' : 'null'}
    >
      {children}
    </div>
  );
  MockGroupSidePanel.displayName = 'GroupSidePanel';
  return MockGroupSidePanel;
});

jest.mock('~/components/Prompts/Groups/FilterPrompts', () => {
  const MockFilterPrompts = ({ setName, className }: any) => (
    <div data-testid="filter-prompts" data-classname={className}>
      <input
        data-testid="filter-input"
        onChange={(e) => setName(e.target.value)}
        placeholder="Filter prompts"
      />
    </div>
  );
  MockFilterPrompts.displayName = 'FilterPrompts';
  return MockFilterPrompts;
});

jest.mock('~/components/Prompts/Groups/AutoSendPrompt', () => {
  const MockAutoSendPrompt = ({ className }: any) => (
    <div data-testid="auto-send-prompt" className={className}>
      <input type="checkbox" data-testid="auto-send-checkbox" />
    </div>
  );
  MockAutoSendPrompt.displayName = 'AutoSendPrompt';
  return MockAutoSendPrompt;
});

const mockUsePromptGroupsNav = jest.requireMock('~/hooks').usePromptGroupsNav;

const createMockGroupsNav = (overrides = {}) => ({
  name: '',
  setName: jest.fn(),
  nextPage: jest.fn(),
  prevPage: jest.fn(),
  isFetching: false,
  pageSize: 10,
  setPageSize: jest.fn(),
  hasNextPage: false,
  groupsQuery: {
    data: { pages: {} },
    isLoading: false,
    hasNextPage: false,
    hasPreviousPage: false,
    fetchNextPage: jest.fn(),
    fetchPreviousPage: jest.fn(),
  },
  promptGroups: [],
  hasPreviousPage: false,
  ...overrides,
});

describe('PromptsAccordion Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePromptGroupsNav.mockReturnValue(createMockGroupsNav());
  });

  describe('Basic Rendering', () => {
    it('renders all main components', () => {
      renderWithState(<PromptsAccordion />);

      expect(screen.getByTestId('group-side-panel')).toBeInTheDocument();
      expect(screen.getByTestId('filter-prompts')).toBeInTheDocument();
      expect(screen.getByTestId('auto-send-prompt')).toBeInTheDocument();
    });

    it('applies correct layout classes', () => {
      renderWithState(<PromptsAccordion />);

      const container = screen.getByTestId('group-side-panel').parentElement;
      expect(container).toHaveClass('flex', 'h-full', 'w-full', 'flex-col');
    });

    it('applies correct spacing to GroupSidePanel', () => {
      renderWithState(<PromptsAccordion />);

      const sidePanel = screen.getByTestId('group-side-panel');
      expect(sidePanel).toHaveClass('mt-2', 'space-y-2', 'lg:w-full', 'xl:w-full');
    });

    it('applies correct styling to AutoSendPrompt', () => {
      renderWithState(<PromptsAccordion />);

      const autoSendPrompt = screen.getByTestId('auto-send-prompt');
      expect(autoSendPrompt).toHaveClass('text-xs', 'dark:text-white');
    });

    it('renders AutoSendPrompt within proper container', () => {
      renderWithState(<PromptsAccordion />);

      const autoSendContainer = screen.getByTestId('auto-send-prompt').parentElement;
      expect(autoSendContainer).toHaveClass(
        'flex',
        'w-full',
        'flex-row',
        'items-center',
        'justify-end',
      );
    });
  });

  describe('Component Integration', () => {
    it('passes groupsNav props to GroupSidePanel', () => {
      const mockGroupsNav = createMockGroupsNav({
        name: 'test',
        pageSize: 20,
        hasNextPage: true,
        hasPreviousPage: true,
      });
      mockUsePromptGroupsNav.mockReturnValue(mockGroupsNav);

      renderWithState(<PromptsAccordion />);

      const sidePanel = screen.getByTestId('group-side-panel');
      expect(sidePanel).toHaveAttribute('data-name', 'test');
      expect(sidePanel).toHaveAttribute('data-pagesize', '20');
      expect(sidePanel).toHaveAttribute('data-hasnextpage', 'true');
      expect(sidePanel).toHaveAttribute('data-haspreviouspage', 'true');
    });

    it('passes setName to FilterPrompts', () => {
      const mockSetName = jest.fn();
      mockUsePromptGroupsNav.mockReturnValue(createMockGroupsNav({ setName: mockSetName }));

      renderWithState(<PromptsAccordion />);

      const filterInput = screen.getByTestId('filter-input');
      fireEvent.change(filterInput, { target: { value: 'test prompt' } });

      expect(mockSetName).toHaveBeenCalledWith('test prompt');
    });

    it('passes correct class to FilterPrompts', () => {
      renderWithState(<PromptsAccordion />);

      const filterPrompts = screen.getByTestId('filter-prompts');
      expect(filterPrompts).toHaveAttribute('data-classname', 'items-center justify-center');
    });
  });

  describe('Hook Integration', () => {
    it('uses usePromptGroupsNav hook', () => {
      renderWithState(<PromptsAccordion />);

      expect(mockUsePromptGroupsNav).toHaveBeenCalled();
    });

    it('re-renders when hook data changes', () => {
      const { rerender } = renderWithState(<PromptsAccordion />);

      mockUsePromptGroupsNav.mockReturnValue(
        createMockGroupsNav({
          name: 'updated',
          isFetching: true,
        }),
      );

      rerender(<PromptsAccordion />);

      const sidePanel = screen.getByTestId('group-side-panel');
      expect(sidePanel).toHaveAttribute('data-name', 'updated');
      expect(sidePanel).toHaveAttribute('data-isfetching', 'true');
    });
  });

  describe('Loading States', () => {
    it('handles loading state from groupsQuery', () => {
      mockUsePromptGroupsNav.mockReturnValue(
        createMockGroupsNav({
          groupsQuery: {
            data: null,
            isLoading: true,
            hasNextPage: false,
            hasPreviousPage: false,
            fetchNextPage: jest.fn(),
            fetchPreviousPage: jest.fn(),
          },
        }),
      );

      renderWithState(<PromptsAccordion />);

      const sidePanel = screen.getByTestId('group-side-panel');
      expect(sidePanel).toHaveAttribute('data-groupsquery', 'exists');
    });

    it('handles fetching state', () => {
      mockUsePromptGroupsNav.mockReturnValue(
        createMockGroupsNav({
          isFetching: true,
        }),
      );

      renderWithState(<PromptsAccordion />);

      const sidePanel = screen.getByTestId('group-side-panel');
      expect(sidePanel).toHaveAttribute('data-isfetching', 'true');
    });
  });

  describe('Pagination States', () => {
    it('handles pagination props', () => {
      const mockNextPage = jest.fn();
      const mockPrevPage = jest.fn();

      mockUsePromptGroupsNav.mockReturnValue(
        createMockGroupsNav({
          nextPage: mockNextPage,
          prevPage: mockPrevPage,
          hasNextPage: true,
          hasPreviousPage: true,
        }),
      );

      renderWithState(<PromptsAccordion />);

      const sidePanel = screen.getByTestId('group-side-panel');
      expect(sidePanel).toHaveAttribute('data-hasnextpage', 'true');
      expect(sidePanel).toHaveAttribute('data-haspreviouspage', 'true');
    });

    it('handles no pagination available', () => {
      mockUsePromptGroupsNav.mockReturnValue(
        createMockGroupsNav({
          hasNextPage: false,
          hasPreviousPage: false,
        }),
      );

      renderWithState(<PromptsAccordion />);

      const sidePanel = screen.getByTestId('group-side-panel');
      expect(sidePanel).toHaveAttribute('data-hasnextpage', 'false');
      expect(sidePanel).toHaveAttribute('data-haspreviouspage', 'false');
    });
  });

  describe('Data Handling', () => {
    it('passes empty promptGroups when no data', () => {
      mockUsePromptGroupsNav.mockReturnValue(
        createMockGroupsNav({
          promptGroups: [],
        }),
      );

      renderWithState(<PromptsAccordion />);

      const sidePanel = screen.getByTestId('group-side-panel');
      expect(sidePanel).toHaveAttribute('data-promptgroups', 'exists');
    });

    it('passes promptGroups when data exists', () => {
      const mockGroups = [
        { id: '1', name: 'Group 1' },
        { id: '2', name: 'Group 2' },
      ];

      mockUsePromptGroupsNav.mockReturnValue(
        createMockGroupsNav({
          promptGroups: mockGroups,
        }),
      );

      renderWithState(<PromptsAccordion />);

      const sidePanel = screen.getByTestId('group-side-panel');
      expect(sidePanel).toHaveAttribute('data-promptgroups', 'exists');
    });

    it('handles pageSize changes', () => {
      const mockSetPageSize = jest.fn();

      mockUsePromptGroupsNav.mockReturnValue(
        createMockGroupsNav({
          pageSize: 25,
          setPageSize: mockSetPageSize,
        }),
      );

      renderWithState(<PromptsAccordion />);

      const sidePanel = screen.getByTestId('group-side-panel');
      expect(sidePanel).toHaveAttribute('data-pagesize', '25');
    });
  });

  describe('Edge Cases', () => {
    it('handles undefined groupsQuery data', () => {
      mockUsePromptGroupsNav.mockReturnValue(
        createMockGroupsNav({
          groupsQuery: {
            data: undefined,
            isLoading: false,
            hasNextPage: false,
            hasPreviousPage: false,
            fetchNextPage: jest.fn(),
            fetchPreviousPage: jest.fn(),
          },
        }),
      );

      renderWithState(<PromptsAccordion />);

      expect(screen.getByTestId('group-side-panel')).toBeInTheDocument();
    });

    it('handles null promptGroups', () => {
      mockUsePromptGroupsNav.mockReturnValue(
        createMockGroupsNav({
          promptGroups: null as any,
        }),
      );

      renderWithState(<PromptsAccordion />);

      expect(screen.getByTestId('group-side-panel')).toBeInTheDocument();
    });

    it('renders correctly when all hook functions are undefined', () => {
      mockUsePromptGroupsNav.mockReturnValue(
        createMockGroupsNav({
          setName: undefined,
          nextPage: undefined,
          prevPage: undefined,
          setPageSize: undefined,
        }),
      );

      renderWithState(<PromptsAccordion />);

      expect(screen.getByTestId('group-side-panel')).toBeInTheDocument();
      expect(screen.getByTestId('filter-prompts')).toBeInTheDocument();
      expect(screen.getByTestId('auto-send-prompt')).toBeInTheDocument();
    });

    it('maintains structure when groupsQuery is in error state', () => {
      mockUsePromptGroupsNav.mockReturnValue(
        createMockGroupsNav({
          groupsQuery: {
            data: null,
            isLoading: false,
            isError: true,
            error: new Error('Failed to fetch'),
            hasNextPage: false,
            hasPreviousPage: false,
            fetchNextPage: jest.fn(),
            fetchPreviousPage: jest.fn(),
          },
        }),
      );

      renderWithState(<PromptsAccordion />);

      expect(screen.getByTestId('group-side-panel')).toBeInTheDocument();
      expect(screen.getByTestId('filter-prompts')).toBeInTheDocument();
      expect(screen.getByTestId('auto-send-prompt')).toBeInTheDocument();
    });

    it('handles rapid setName calls', async () => {
      const mockSetName = jest.fn();
      mockUsePromptGroupsNav.mockReturnValue(createMockGroupsNav({ setName: mockSetName }));

      const user = userEvent.setup();
      renderWithState(<PromptsAccordion />);

      const filterInput = screen.getByTestId('filter-input');

      await user.type(filterInput, 'test');

      await waitFor(() => {
        expect(mockSetName).toHaveBeenCalledTimes(4);
      });
    });

    it('maintains component hierarchy with empty hook return', () => {
      mockUsePromptGroupsNav.mockReturnValue({} as any);

      renderWithState(<PromptsAccordion />);

      const container = screen.getByTestId('group-side-panel').parentElement;
      expect(container).toHaveClass('flex', 'h-full', 'w-full', 'flex-col');
      expect(screen.getByTestId('filter-prompts')).toBeInTheDocument();
      expect(screen.getByTestId('auto-send-prompt')).toBeInTheDocument();
    });
  });
});
