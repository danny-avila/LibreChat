import { act, fireEvent, render, screen } from '@testing-library/react';

type SearchState = {
  query: string;
  debouncedQuery: string;
  isTyping: boolean;
  enabled: boolean;
};

const initialState = (): SearchState => ({
  query: '',
  debouncedQuery: '',
  isTyping: false,
  enabled: true,
});

let mockSearchState = initialState();

const mockSetSearchState = jest.fn((update: SearchState | ((prev: SearchState) => SearchState)) => {
  mockSearchState = typeof update === 'function' ? update(mockSearchState) : update;
});

jest.mock('recoil', () => ({
  useRecoilState: () => [mockSearchState, mockSetSearchState],
}));

jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/c/new' }),
  useNavigate: () => jest.fn(),
}));

const newQueryClient = () => ({ removeQueries: jest.fn(), invalidateQueries: jest.fn() });

let mockQueryClient = newQueryClient();

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useNewConvo: () => ({ newConversation: jest.fn() }),
}));

jest.mock('~/hooks/useKeyboardShortcuts', () => ({
  useShortcutAriaKey: () => 'Meta+/',
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: { search: 'search' },
}));

jest.mock('~/utils', () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

import SearchBar from '../SearchBar';

const input = () => screen.getByTestId('nav-search-input') as HTMLInputElement;

const type = (value: string) => fireEvent.change(input(), { target: { value } });

const settle = () =>
  act(() => {
    jest.advanceTimersByTime(1000);
  });

/**
 * The field is mounted in two places — the list on a pointer device, the
 * drawer's bottom bar on touch — so crossing the breakpoint mid-search destroys
 * one instance and builds another against the same shared search state.
 */
describe('SearchBar across a breakpoint remount', () => {
  afterEach(() => {
    mockSearchState = initialState();
    mockQueryClient = newQueryClient();
    mockSetSearchState.mockClear();
  });

  describe('what the arriving instance shows', () => {
    it('shows the active query when mounted fresh', () => {
      mockSearchState = { ...mockSearchState, query: 'mobile nav', debouncedQuery: 'mobile nav' };

      render(<SearchBar />);

      expect(input().value).toBe('mobile nav');
    });

    it('offers the clear affordance for a query it inherited', () => {
      mockSearchState = { ...mockSearchState, query: 'mobile nav', debouncedQuery: 'mobile nav' };

      render(<SearchBar />);

      expect(screen.getByLabelText('com_ui_clear_search')).toBeEnabled();
    });

    it('starts empty when no search is active', () => {
      render(<SearchBar />);

      expect(input().value).toBe('');
    });
  });

  describe('what the departing instance must not do', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    /** Without this the two negative cases below would pass on a dead debounce. */
    it('commits the typed query once typing settles', () => {
      render(<SearchBar />);

      type('mobile nav');
      settle();

      expect(mockSearchState.debouncedQuery).toBe('mobile nav');
    });

    /** The cancel must be bound to unmount, not to the debounce being rebuilt. */
    it('keeps its pending query when its dependencies are rebuilt mid-keystroke', () => {
      const { rerender } = render(<SearchBar />);

      type('mobile nav');
      mockQueryClient = newQueryClient();
      rerender(<SearchBar />);
      settle();

      expect(mockSearchState.debouncedQuery).toBe('mobile nav');
    });

    it('drops its pending query when it is replaced mid-keystroke', () => {
      const { unmount } = render(<SearchBar />);

      type('mobile nav');
      unmount();
      settle();

      expect(mockSearchState.debouncedQuery).toBe('');
    });

    /**
     * The swap must not strand a user who simply stops typing: the arriving
     * field takes the uncommitted query over rather than showing text no
     * search is running on.
     */
    it('commits the query it inherited uncommitted', () => {
      mockSearchState = { ...mockSearchState, query: 'mobile nav', isTyping: true };

      render(<SearchBar />);
      settle();

      expect(mockSearchState.debouncedQuery).toBe('mobile nav');
      expect(mockSearchState.isTyping).toBe(false);
    });

    it('lets an edit of the arriving field beat the inherited query', () => {
      mockSearchState = { ...mockSearchState, query: 'mobile nav', isTyping: true };

      render(<SearchBar />);
      type('full width');
      settle();

      expect(mockSearchState.debouncedQuery).toBe('full width');
    });

    it('leaves a settled query alone on arrival', () => {
      mockSearchState = {
        ...mockSearchState,
        query: 'mobile nav',
        debouncedQuery: 'mobile nav',
      };

      render(<SearchBar />);
      settle();

      expect(mockSetSearchState).not.toHaveBeenCalled();
    });

    it('drops its pending query when the field is cleared', () => {
      render(<SearchBar />);

      type('mobile nav');
      fireEvent.click(screen.getByLabelText('com_ui_clear_search'));
      settle();

      expect(mockSearchState.debouncedQuery).toBe('');
    });
  });
});
