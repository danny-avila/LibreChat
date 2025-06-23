import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CategoryTabs from '../CategoryTabs';
import AgentGrid from '../AgentGrid';
import AgentCard from '../AgentCard';
import SearchBar from '../SearchBar';
import ErrorDisplay from '../ErrorDisplay';

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(() => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock hooks
jest.mock(
  '~/hooks/useLocalize',
  () => () =>
    jest.fn((key: string, options?: any) => {
      const translations: Record<string, string> = {
        com_agents_category_tabs_label: 'Agent Categories',
        com_agents_category_tab_label: `${options?.category} category, ${options?.position} of ${options?.total}`,
        com_agents_search_instructions: 'Type to search agents by name or description',
        com_agents_search_aria: 'Search agents',
        com_agents_search_placeholder: 'Search agents...',
        com_agents_clear_search: 'Clear search',
        com_agents_agent_card_label: `${options?.name} agent. ${options?.description}`,
        com_agents_no_description: 'No description available',
        com_agents_grid_announcement: `Showing ${options?.count} agents in ${options?.category} category`,
        com_agents_load_more_label: `Load more agents from ${options?.category} category`,
        com_agents_error_retry: 'Try Again',
        com_agents_loading: 'Loading...',
        com_agents_empty_state_heading: 'No agents found',
        com_agents_search_empty_heading: 'No search results',
      };
      return translations[key] || key;
    }),
);

jest.mock('~/hooks/Agents', () => ({
  useDynamicAgentQuery: jest.fn(),
}));

const { useDynamicAgentQuery } = require('~/hooks/Agents');

// Create wrapper with QueryClient
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('Accessibility Improvements', () => {
  beforeEach(() => {
    useDynamicAgentQuery.mockClear();
  });

  describe('CategoryTabs Accessibility', () => {
    const categories = [
      { name: 'promoted', count: 5 },
      { name: 'all', count: 20 },
      { name: 'productivity', count: 8 },
    ];

    it('implements proper tablist role and ARIA attributes', () => {
      render(
        <CategoryTabs
          categories={categories}
          activeTab="promoted"
          isLoading={false}
          onChange={jest.fn()}
        />,
      );

      // Check tablist role
      const tablist = screen.getByRole('tablist');
      expect(tablist).toBeInTheDocument();
      expect(tablist).toHaveAttribute('aria-label', 'Agent Categories');
      expect(tablist).toHaveAttribute('aria-orientation', 'horizontal');

      // Check individual tabs
      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(3);

      tabs.forEach((tab, index) => {
        expect(tab).toHaveAttribute('aria-selected');
        expect(tab).toHaveAttribute('aria-controls');
        expect(tab).toHaveAttribute('id');
      });
    });

    it('supports keyboard navigation', () => {
      const onChange = jest.fn();
      render(
        <CategoryTabs
          categories={categories}
          activeTab="promoted"
          isLoading={false}
          onChange={onChange}
        />,
      );

      const promotedTab = screen.getByRole('tab', { name: /promoted category/ });

      // Test arrow key navigation
      fireEvent.keyDown(promotedTab, { key: 'ArrowRight' });
      expect(onChange).toHaveBeenCalledWith('all');

      fireEvent.keyDown(promotedTab, { key: 'ArrowLeft' });
      expect(onChange).toHaveBeenCalledWith('productivity');

      fireEvent.keyDown(promotedTab, { key: 'Home' });
      expect(onChange).toHaveBeenCalledWith('promoted');

      fireEvent.keyDown(promotedTab, { key: 'End' });
      expect(onChange).toHaveBeenCalledWith('productivity');
    });

    it('manages focus correctly', () => {
      const onChange = jest.fn();
      render(
        <CategoryTabs
          categories={categories}
          activeTab="promoted"
          isLoading={false}
          onChange={onChange}
        />,
      );

      const promotedTab = screen.getByRole('tab', { name: /promoted category/ });
      const allTab = screen.getByRole('tab', { name: /all category/ });

      // Active tab should be focusable
      expect(promotedTab).toHaveAttribute('tabIndex', '0');
      expect(allTab).toHaveAttribute('tabIndex', '-1');
    });
  });

  describe('SearchBar Accessibility', () => {
    it('provides proper search role and labels', () => {
      render(<SearchBar value="" onSearch={jest.fn()} />);

      // Check search landmark
      const searchRegion = screen.getByRole('search');
      expect(searchRegion).toBeInTheDocument();

      // Check input accessibility
      const searchInput = screen.getByRole('searchbox');
      expect(searchInput).toHaveAttribute('id', 'agent-search');
      expect(searchInput).toHaveAttribute('aria-label', 'Search agents');
      expect(searchInput).toHaveAttribute(
        'aria-describedby',
        'search-instructions search-results-count',
      );

      // Check hidden label
      expect(screen.getByText('Type to search agents by name or description')).toHaveClass(
        'sr-only',
      );
    });

    it('provides accessible clear button', () => {
      render(<SearchBar value="test" onSearch={jest.fn()} />);

      const clearButton = screen.getByRole('button', { name: 'Clear search' });
      expect(clearButton).toBeInTheDocument();
      expect(clearButton).toHaveAttribute('aria-label', 'Clear search');
      expect(clearButton).toHaveAttribute('title', 'Clear search');
    });

    it('hides decorative icons from screen readers', () => {
      render(<SearchBar value="" onSearch={jest.fn()} />);

      // Search icon should be hidden
      const iconContainer = document.querySelector('[aria-hidden="true"]');
      expect(iconContainer).toBeInTheDocument();
    });
  });

  describe('AgentCard Accessibility', () => {
    const mockAgent = {
      id: 'test-agent',
      name: 'Test Agent',
      description: 'A test agent for testing',
      authorName: 'Test Author',
    };

    it('provides comprehensive ARIA labels', () => {
      render(<AgentCard agent={mockAgent} onClick={jest.fn()} />);

      const card = screen.getByRole('button');
      expect(card).toHaveAttribute('aria-label', 'Test Agent agent. A test agent for testing');
      expect(card).toHaveAttribute('aria-describedby', 'agent-test-agent-description');
      expect(card).toHaveAttribute('role', 'button');
    });

    it('handles agents without descriptions', () => {
      const agentWithoutDesc = { ...mockAgent, description: undefined };
      render(<AgentCard agent={agentWithoutDesc} onClick={jest.fn()} />);

      expect(screen.getByText('No description available')).toBeInTheDocument();
    });

    it('supports keyboard interaction', () => {
      const onClick = jest.fn();
      render(<AgentCard agent={mockAgent} onClick={onClick} />);

      const card = screen.getByRole('button');

      fireEvent.keyDown(card, { key: 'Enter' });
      expect(onClick).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(card, { key: ' ' });
      expect(onClick).toHaveBeenCalledTimes(2);
    });
  });

  describe('AgentGrid Accessibility', () => {
    beforeEach(() => {
      useDynamicAgentQuery.mockReturnValue({
        data: {
          agents: [
            { id: '1', name: 'Agent 1', description: 'First agent' },
            { id: '2', name: 'Agent 2', description: 'Second agent' },
          ],
          pagination: { hasMore: false, total: 2, current: 1 },
        },
        isLoading: false,
        isFetching: false,
        error: null,
        refetch: jest.fn(),
      });
    });

    it('implements proper tabpanel structure', () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <AgentGrid category="all" searchQuery="" onSelectAgent={jest.fn()} />
        </Wrapper>,
      );

      // Check tabpanel role
      const tabpanel = screen.getByRole('tabpanel');
      expect(tabpanel).toHaveAttribute('id', 'category-panel-all');
      expect(tabpanel).toHaveAttribute('aria-labelledby', 'category-tab-all');
      expect(tabpanel).toHaveAttribute('aria-live', 'polite');
    });

    it('provides grid structure with proper roles', () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <AgentGrid category="all" searchQuery="" onSelectAgent={jest.fn()} />
        </Wrapper>,
      );

      // Check grid role
      const grid = screen.getByRole('grid');
      expect(grid).toBeInTheDocument();
      expect(grid).toHaveAttribute('aria-label', 'Showing 2 agents in all category');

      // Check gridcells
      const gridcells = screen.getAllByRole('gridcell');
      expect(gridcells).toHaveLength(2);
    });

    it('announces loading states to screen readers', () => {
      useDynamicAgentQuery.mockReturnValue({
        data: { agents: [{ id: '1', name: 'Agent 1' }] },
        isLoading: false,
        isFetching: true,
        error: null,
        refetch: jest.fn(),
      });

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <AgentGrid category="all" searchQuery="" onSelectAgent={jest.fn()} />
        </Wrapper>,
      );

      // Check for loading announcement
      const loadingStatus = screen.getByRole('status', { name: 'Loading...' });
      expect(loadingStatus).toBeInTheDocument();
      expect(loadingStatus).toHaveAttribute('aria-live', 'polite');
    });

    it('provides accessible empty states', () => {
      useDynamicAgentQuery.mockReturnValue({
        data: { agents: [], pagination: { hasMore: false, total: 0, current: 1 } },
        isLoading: false,
        isFetching: false,
        error: null,
        refetch: jest.fn(),
      });

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <AgentGrid category="all" searchQuery="" onSelectAgent={jest.fn()} />
        </Wrapper>,
      );

      // Check empty state accessibility
      const emptyState = screen.getByRole('status');
      expect(emptyState).toHaveAttribute('aria-live', 'polite');
      expect(emptyState).toHaveAttribute('aria-label', 'No agents found');
    });
  });

  describe('ErrorDisplay Accessibility', () => {
    const mockError = {
      response: {
        data: {
          userMessage: 'Unable to load agents. Please try refreshing the page.',
          suggestion: 'Try refreshing the page or check your network connection',
        },
      },
    };

    it('implements proper alert role and ARIA attributes', () => {
      render(<ErrorDisplay error={mockError} onRetry={jest.fn()} />);

      // Check alert role
      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-live', 'assertive');
      expect(alert).toHaveAttribute('aria-atomic', 'true');

      // Check heading structure
      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toHaveAttribute('id', 'error-title');
    });

    it('provides accessible retry button', () => {
      const onRetry = jest.fn();
      render(<ErrorDisplay error={mockError} onRetry={onRetry} />);

      const retryButton = screen.getByRole('button', { name: /retry action/i });
      expect(retryButton).toHaveAttribute('aria-describedby', 'error-message error-suggestion');

      fireEvent.click(retryButton);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('structures error content with proper semantics', () => {
      render(<ErrorDisplay error={mockError} />);

      // Check error message structure
      expect(screen.getByText(/unable to load agents/i)).toHaveAttribute('id', 'error-message');

      // Check suggestion note
      const suggestion = screen.getByRole('note');
      expect(suggestion).toHaveAttribute('aria-label', expect.stringContaining('Suggestion:'));
    });
  });

  describe('Focus Management', () => {
    it('maintains proper focus ring styles', () => {
      const { container } = render(<SearchBar value="" onSearch={jest.fn()} />);

      // Check for focus styles in CSS classes
      const searchInput = container.querySelector('input');
      expect(searchInput?.className).toContain('focus:');
    });

    it('provides visible focus indicators on interactive elements', () => {
      render(
        <CategoryTabs
          categories={[{ name: 'test', count: 1 }]}
          activeTab="test"
          isLoading={false}
          onChange={jest.fn()}
        />,
      );

      const tab = screen.getByRole('tab');
      expect(tab.className).toContain('focus:outline-none');
      expect(tab.className).toContain('focus:ring-2');
    });
  });

  describe('Screen Reader Announcements', () => {
    it('includes live regions for dynamic content', () => {
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <AgentGrid category="all" searchQuery="" onSelectAgent={jest.fn()} />
        </Wrapper>,
      );

      // Check for live region
      const liveRegion = document.querySelector('[aria-live="polite"]');
      expect(liveRegion).toBeInTheDocument();
    });

    it('provides screen reader only content', () => {
      render(<SearchBar value="" onSearch={jest.fn()} />);

      // Check for screen reader only instructions
      const srOnlyElement = document.querySelector('.sr-only');
      expect(srOnlyElement).toBeInTheDocument();
    });
  });
});

export default {};
