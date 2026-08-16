import { render, screen } from '@testing-library/react';

let mockSearchState = { query: '', debouncedQuery: '', isTyping: false, enabled: true };

jest.mock('recoil', () => ({
  useRecoilState: () => [mockSearchState, jest.fn()],
}));

jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/c/new' }),
  useNavigate: () => jest.fn(),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ removeQueries: jest.fn() }),
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

describe('SearchBar hydration', () => {
  afterEach(() => {
    mockSearchState = { query: '', debouncedQuery: '', isTyping: false, enabled: true };
  });

  /**
   * The field is mounted in two places — the list on a pointer device, the
   * drawer's bottom bar on touch — so crossing the breakpoint mid-search
   * destroys one instance and builds another. A blank box beside filtered
   * results is the failure this guards.
   */
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
