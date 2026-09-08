import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import Marketplace from '../Marketplace';

/**
 * Props recorded from every `AgentGrid` mount, in mount order. The marketplace renders
 * the grid twice during the 300ms category animation, so "which pane got which prop" is
 * what most of these tests are actually about.
 */
const gridProps: Array<Record<string, unknown>> = [];

const mockLocalize = jest.fn((key: string) => {
  const translations: Record<string, string> = {
    com_agents_marketplace: 'Agent Marketplace',
    com_agents_filter_mine: 'Only Agents I created',
    com_agents_sort_label: 'Sort by',
    com_agents_sort_newest: 'Newest first',
    com_agents_sort_oldest: 'Oldest first',
    com_agents_sort_popular: 'Popular',
    com_agents_sort_author: 'By creator name',
    com_agents_top_picks: 'Top Picks',
    com_agents_recommended: 'Our recommended agents',
    com_agents_all: 'All Agents',
    com_agents_all_description: 'Browse all shared agents across all categories',
    com_agents_count: 'agents',
  };
  return translations[key] || key;
});

let mockHasAccess = true;

jest.mock('~/hooks', () => ({
  useLocalize: () => mockLocalize,
  useDocumentTitle: jest.fn(),
  useHasAccess: jest.fn(() => mockHasAccess),
}));

jest.mock('~/data-provider', () => ({
  useGetEndpointsQuery: jest.fn(() => ({ data: {} })),
  useGetAgentCategoriesQuery: jest.fn(() => ({
    data: [
      { value: 'promoted', label: 'com_agents_top_picks' },
      { value: 'all', label: 'com_agents_all' },
      { value: 'productivity', label: 'Productivity', description: 'Get things done' },
    ],
    isLoading: false,
  })),
}));

jest.mock('~/components/SidePanel', () => ({
  SidePanelGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('~/components/Chat/Menus/OpenSidebar', () => ({
  __esModule: true,
  default: () => <div data-testid="open-sidebar" />,
}));

jest.mock('../MarketplaceAdminSettings', () => ({
  __esModule: true,
  default: () => <div data-testid="admin-settings" />,
}));

jest.mock('../SearchBar', () => ({
  __esModule: true,
  default: ({ value, onSearch }: { value: string; onSearch: (q: string) => void }) => (
    <input
      data-testid="search-bar"
      value={value}
      onChange={(event) => onSearch(event.target.value)}
    />
  ),
}));

jest.mock('../CategoryTabs', () => ({
  __esModule: true,
  default: ({
    categories,
    onChange,
  }: {
    categories: Array<{ value: string; label: string }>;
    onChange: (value: string) => void;
  }) => (
    <div>
      {categories.map((category) => (
        <button
          key={category.value}
          data-testid={`tab-${category.value}`}
          onClick={() => onChange(category.value)}
        >
          {category.value}
        </button>
      ))}
    </div>
  ),
}));

jest.mock('../AgentGrid', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    gridProps.push(props);
    return <div data-testid={`agent-grid-${props.category as string}`} />;
  },
}));

const LocationDisplay = () => {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
};

const renderMarketplace = (initialEntry = '/agents') => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <LocationDisplay />
        <Routes>
          <Route path="/agents" element={<Marketplace />} />
          <Route path="/agents/:category" element={<Marketplace />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const currentUrl = () => screen.getByTestId('location').textContent;

/**
 * The "default to promoted on a bare /agents" effect reads `window.location.pathname`,
 * which MemoryRouter does not drive — so jsdom's real location has to be moved for the
 * promoted landing tab to be reachable in tests. Call before `renderMarketplace`.
 */
const landOnBareAgentsPath = () => window.history.replaceState({}, '', '/agents');

describe('Marketplace controls', () => {
  beforeEach(() => {
    gridProps.length = 0;
    mockHasAccess = true;
    // `landOnBareAgentsPath` mutates the shared jsdom location; keep it test-scoped
    window.history.replaceState({}, '', '/');
  });

  describe('"Only Agents I created" toggle', () => {
    it('renders unchecked by default and passes mine=0 to the grid', () => {
      renderMarketplace();

      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
      expect(gridProps[0].mine).toBe(0);
    });

    it('exposes the localized label as the switch accessible name', () => {
      renderMarketplace();

      expect(screen.getByRole('switch', { name: 'Only Agents I created' })).toBeInTheDocument();
    });

    it('associates the label programmatically rather than by proximity', () => {
      renderMarketplace();

      const labelId = screen.getByRole('switch').getAttribute('aria-labelledby');
      expect(labelId).toBeTruthy();
      expect(document.getElementById(labelId as string)?.textContent).toBe('Only Agents I created');
    });

    it('turns the filter on and passes it to the grid', () => {
      renderMarketplace('/agents/productivity');

      fireEvent.click(screen.getByRole('switch'));

      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
      expect(gridProps.at(-1)?.mine).toBe(1);
      expect(currentUrl()).toContain('mine=1');
    });

    it('turns the filter back off and drops it from the URL', () => {
      renderMarketplace('/agents/productivity?mine=1');

      fireEvent.click(screen.getByRole('switch'));

      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
      expect(gridProps.at(-1)?.mine).toBe(0);
      expect(currentUrl()).not.toContain('mine');
    });

    it('initialises from ?mine=1', () => {
      renderMarketplace('/agents/productivity?mine=1');

      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
      expect(gridProps[0].mine).toBe(1);
    });

    it('ignores a mine value other than 1', () => {
      renderMarketplace('/agents/productivity?mine=0');

      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
      expect(gridProps[0].mine).toBe(0);
    });

    it('preserves an existing ?q= when toggling on and off', () => {
      renderMarketplace('/agents/productivity?q=invoice');

      fireEvent.click(screen.getByRole('switch'));
      expect(currentUrl()).toContain('q=invoice');
      expect(currentUrl()).toContain('mine=1');

      fireEvent.click(screen.getByRole('switch'));
      expect(currentUrl()).toContain('q=invoice');
      expect(currentUrl()).not.toContain('mine');
    });
  });

  /**
   * `is_promoted` has no write path in the app, so "promoted AND authored by me" is
   * structurally empty for ordinary users — and a bare `/agents` lands on the promoted
   * tab, so this would be the very first thing the toggle does.
   */
  describe('mine + promoted', () => {
    it('leaves the promoted tab for all when switched on, without dropping mine', () => {
      landOnBareAgentsPath();
      renderMarketplace();
      expect(gridProps.at(-1)?.category).toBe('promoted');
      gridProps.length = 0;

      fireEvent.click(screen.getByRole('switch'));

      expect(gridProps.at(-1)?.category).toBe('all');
      expect(gridProps.at(-1)?.mine).toBe(1);
      expect(currentUrl()).toContain('/agents/all');
      expect(currentUrl()).toContain('mine=1');
    });

    it('makes the jump without running the slide animation', () => {
      landOnBareAgentsPath();
      renderMarketplace();
      gridProps.length = 0;

      fireEvent.click(screen.getByRole('switch'));

      // A slide would mount a second, transient grid for the outgoing category.
      expect(screen.queryByTestId('agent-grid-promoted')).not.toBeInTheDocument();
      expect(screen.getAllByRole('switch')).toHaveLength(1);
    });

    it('stays on the current tab when switched on outside promoted', () => {
      renderMarketplace('/agents/productivity');

      fireEvent.click(screen.getByRole('switch'));

      expect(gridProps.at(-1)?.category).toBe('productivity');
      expect(currentUrl()).toContain('/agents/productivity');
    });

    it('never changes tab when the toggle is switched off', () => {
      landOnBareAgentsPath();
      renderMarketplace('/agents?mine=1');

      fireEvent.click(screen.getByRole('switch'));

      expect(gridProps.at(-1)?.category).toBe('promoted');
      expect(currentUrl()).not.toContain('/agents/all');
    });
  });

  describe('sort dropdown', () => {
    it('defaults to newest and omits sort from the URL', () => {
      renderMarketplace('/agents/productivity');

      expect(gridProps[0].sort).toBe('newest');
      expect(currentUrl()).not.toContain('sort');
    });

    it('reads a valid sort from the URL', () => {
      renderMarketplace('/agents/productivity?sort=popular');

      expect(gridProps[0].sort).toBe('popular');
    });

    it('falls back to newest for an unknown sort value', () => {
      renderMarketplace('/agents/productivity?sort=bogus');

      expect(gridProps[0].sort).toBe('newest');
    });

    it('labels the control and gives it a stable, pane-specific test id', () => {
      renderMarketplace('/agents/productivity');

      const dropdown = screen.getByTestId('agent-sort-dropdown-current');
      const labelId = dropdown.getAttribute('aria-labelledby')?.split(' ')[0];
      expect(labelId).toBeTruthy();
      expect(document.getElementById(labelId as string)?.textContent).toBe('Sort by');
    });
  });

  /**
   * The highest-risk part of this layout: the category header and the grid are both
   * rendered twice during the 300ms tab animation. Threading the controls into only one
   * pane makes them flicker or reset mid-animation.
   */
  describe('both animation panes', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const startCategoryTransition = (tab: string) => {
      act(() => {
        fireEvent.click(screen.getByTestId(`tab-${tab}`));
      });
    };

    const finishTransition = () => {
      act(() => {
        jest.advanceTimersByTime(300);
      });
    };

    it('passes mine and sort to both grids during a category transition', () => {
      renderMarketplace('/agents/all?mine=1&sort=popular');
      gridProps.length = 0;

      startCategoryTransition('productivity');

      expect(gridProps.length).toBeGreaterThan(1);
      expect(gridProps.map((props) => props.category)).toContain('productivity');
      expect(gridProps.every((props) => props.mine === 1)).toBe(true);
      expect(gridProps.every((props) => props.sort === 'popular')).toBe(true);

      finishTransition();
    });

    it('renders both controls in both panes during a category transition', () => {
      renderMarketplace('/agents/all?mine=1');

      startCategoryTransition('productivity');

      const toggles = screen.getAllByRole('switch');
      expect(toggles).toHaveLength(2);
      expect(toggles.every((toggle) => toggle.getAttribute('aria-checked') === 'true')).toBe(true);
      expect(screen.getByTestId('agent-sort-dropdown-current')).toBeInTheDocument();
      expect(screen.getByTestId('agent-sort-dropdown-next')).toBeInTheDocument();

      finishTransition();
    });

    it('gives the two simultaneous toggles distinct label ids', () => {
      renderMarketplace('/agents/all');

      startCategoryTransition('productivity');

      const labelIds = screen
        .getAllByRole('switch')
        .map((toggle) => toggle.getAttribute('aria-labelledby'));

      expect(labelIds).toHaveLength(2);
      expect(new Set(labelIds).size).toBe(2);
      labelIds.forEach((id) => {
        expect(document.querySelectorAll(`[id="${id}"]`)).toHaveLength(1);
      });

      finishTransition();
    });

    it('passes onCountChange to the current pane only', () => {
      renderMarketplace('/agents/all');
      gridProps.length = 0;

      startCategoryTransition('productivity');

      // The transition pane is the one showing the incoming category; the header count
      // would flicker between two values if both panes reported it.
      const incoming = gridProps.filter((props) => props.category === 'productivity');
      const outgoing = gridProps.filter((props) => props.category === 'all');
      expect(incoming.length).toBeGreaterThan(0);
      expect(outgoing.length).toBeGreaterThan(0);
      expect(incoming.every((props) => props.onCountChange === undefined)).toBe(true);
      expect(outgoing.every((props) => props.onCountChange !== undefined)).toBe(true);

      finishTransition();
    });

    it('keeps the toggle on across a completed category change', () => {
      renderMarketplace('/agents/all?mine=1');

      startCategoryTransition('productivity');
      finishTransition();

      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
      expect(gridProps.at(-1)?.mine).toBe(1);
      expect(currentUrl()).toContain('mine=1');
    });
  });

  /** The controls row always renders, so a filter can never be applied invisibly. */
  describe('while searching', () => {
    it('shows the category title and description when not searching', () => {
      renderMarketplace('/agents/productivity');

      expect(screen.getByRole('heading', { level: 2, name: 'Productivity' })).toBeInTheDocument();
      expect(screen.getByText('Get things done')).toBeInTheDocument();
    });

    it('hides the category title and description but keeps the controls', () => {
      renderMarketplace('/agents/productivity?q=invoice');

      expect(
        screen.queryByRole('heading', { level: 2, name: 'Productivity' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Get things done')).not.toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'Only Agents I created' })).toBeInTheDocument();
      expect(screen.getByTestId('agent-sort-dropdown-current')).toBeInTheDocument();
    });

    it('applies mine and the search query together', () => {
      renderMarketplace('/agents/productivity?q=invoice&mine=1');

      expect(gridProps[0].mine).toBe(1);
      expect(gridProps[0].searchQuery).toBe('invoice');
    });
  });
});
