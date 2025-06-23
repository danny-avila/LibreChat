import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AgentGrid from '../AgentGrid';
import { useDynamicAgentQuery } from '~/hooks/Agents';
import type t from 'librechat-data-provider';

// Mock the dynamic agent query hook
jest.mock('~/hooks/Agents', () => ({
  useDynamicAgentQuery: jest.fn(),
}));

// Mock useLocalize hook
jest.mock('~/hooks/useLocalize', () => () => (key: string) => {
  const mockTranslations: Record<string, string> = {
    com_agents_top_picks: 'Top Picks',
    com_agents_all: 'All Agents',
    com_agents_recommended: 'Our recommended agents',
    com_agents_results_for: 'Results for "{{query}}"',
    com_agents_see_more: 'See more',
    com_agents_error_loading: 'Error loading agents',
    com_agents_error_searching: 'Error searching agents',
    com_agents_no_results: 'No agents found. Try another search term.',
    com_agents_none_in_category: 'No agents found in this category',
  };
  return mockTranslations[key] || key;
});

// Mock getCategoryDisplayName and getCategoryDescription
jest.mock('~/utils/agents', () => ({
  getCategoryDisplayName: (category: string) => {
    const names: Record<string, string> = {
      promoted: 'Top Picks',
      all: 'All',
      general: 'General',
      hr: 'HR',
      finance: 'Finance',
    };
    return names[category] || category;
  },
  getCategoryDescription: (category: string) => {
    const descriptions: Record<string, string> = {
      promoted: 'Our recommended agents',
      all: 'Browse all available agents',
      general: 'General purpose agents',
      hr: 'HR agents',
      finance: 'Finance agents',
    };
    return descriptions[category] || '';
  },
}));

const mockUseDynamicAgentQuery = useDynamicAgentQuery as jest.MockedFunction<
  typeof useDynamicAgentQuery
>;

describe('AgentGrid Integration with useDynamicAgentQuery', () => {
  const mockOnSelectAgent = jest.fn();

  const mockAgents: Partial<t.Agent>[] = [
    {
      id: '1',
      name: 'Test Agent 1',
      description: 'First test agent',
      avatar: '/avatar1.png',
    },
    {
      id: '2',
      name: 'Test Agent 2',
      description: 'Second test agent',
      avatar: { filepath: '/avatar2.png' },
    },
  ];

  const defaultMockQueryResult = {
    data: {
      agents: mockAgents,
      pagination: {
        current: 1,
        hasMore: true,
        total: 10,
      },
    },
    isLoading: false,
    error: null,
    isFetching: false,
    queryType: 'promoted' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDynamicAgentQuery.mockReturnValue(defaultMockQueryResult);
  });

  describe('Query Integration', () => {
    it('should call useDynamicAgentQuery with correct parameters', () => {
      render(
        <AgentGrid category="finance" searchQuery="test query" onSelectAgent={mockOnSelectAgent} />,
      );

      expect(mockUseDynamicAgentQuery).toHaveBeenCalledWith({
        category: 'finance',
        searchQuery: 'test query',
        page: 1,
        limit: 6,
      });
    });

    it('should update page when "See More" is clicked', async () => {
      render(<AgentGrid category="hr" searchQuery="" onSelectAgent={mockOnSelectAgent} />);

      const seeMoreButton = screen.getByText('See more');
      fireEvent.click(seeMoreButton);

      await waitFor(() => {
        expect(mockUseDynamicAgentQuery).toHaveBeenCalledWith({
          category: 'hr',
          searchQuery: '',
          page: 2,
          limit: 6,
        });
      });
    });

    it('should reset page when category changes', () => {
      const { rerender } = render(
        <AgentGrid category="general" searchQuery="" onSelectAgent={mockOnSelectAgent} />,
      );

      // Simulate clicking "See More" to increment page
      const seeMoreButton = screen.getByText('See more');
      fireEvent.click(seeMoreButton);

      // Change category - should reset page to 1
      rerender(<AgentGrid category="finance" searchQuery="" onSelectAgent={mockOnSelectAgent} />);

      expect(mockUseDynamicAgentQuery).toHaveBeenLastCalledWith({
        category: 'finance',
        searchQuery: '',
        page: 1,
        limit: 6,
      });
    });

    it('should reset page when search query changes', () => {
      const { rerender } = render(
        <AgentGrid category="hr" searchQuery="" onSelectAgent={mockOnSelectAgent} />,
      );

      // Change search query - should reset page to 1
      rerender(
        <AgentGrid category="hr" searchQuery="new search" onSelectAgent={mockOnSelectAgent} />,
      );

      expect(mockUseDynamicAgentQuery).toHaveBeenLastCalledWith({
        category: 'hr',
        searchQuery: 'new search',
        page: 1,
        limit: 6,
      });
    });
  });

  describe('Different Query Types Display', () => {
    it('should display correct title for promoted category', () => {
      mockUseDynamicAgentQuery.mockReturnValue({
        ...defaultMockQueryResult,
        queryType: 'promoted',
      });

      render(<AgentGrid category="promoted" searchQuery="" onSelectAgent={mockOnSelectAgent} />);

      expect(screen.getByText('Top Picks')).toBeInTheDocument();
      expect(screen.getByText('Our recommended agents')).toBeInTheDocument();
    });

    it('should display correct title for search results', () => {
      mockUseDynamicAgentQuery.mockReturnValue({
        ...defaultMockQueryResult,
        queryType: 'search',
      });

      render(
        <AgentGrid category="all" searchQuery="test search" onSelectAgent={mockOnSelectAgent} />,
      );

      expect(screen.getByText('Results for "test search"')).toBeInTheDocument();
    });

    it('should display correct title for specific category', () => {
      mockUseDynamicAgentQuery.mockReturnValue({
        ...defaultMockQueryResult,
        queryType: 'category',
      });

      render(<AgentGrid category="finance" searchQuery="" onSelectAgent={mockOnSelectAgent} />);

      expect(screen.getByText('Finance')).toBeInTheDocument();
      expect(screen.getByText('Finance agents')).toBeInTheDocument();
    });

    it('should display correct title for all category', () => {
      mockUseDynamicAgentQuery.mockReturnValue({
        ...defaultMockQueryResult,
        queryType: 'all',
      });

      render(<AgentGrid category="all" searchQuery="" onSelectAgent={mockOnSelectAgent} />);

      expect(screen.getByText('All')).toBeInTheDocument();
      expect(screen.getByText('Browse all available agents')).toBeInTheDocument();
    });
  });

  describe('Loading and Error States', () => {
    it('should show loading skeleton when isLoading is true and no data', () => {
      mockUseDynamicAgentQuery.mockReturnValue({
        ...defaultMockQueryResult,
        data: undefined,
        isLoading: true,
      });

      render(<AgentGrid category="general" searchQuery="" onSelectAgent={mockOnSelectAgent} />);

      // Should show loading skeletons
      const loadingElements = screen.getAllByRole('generic');
      const hasLoadingClass = loadingElements.some((el) => el.className.includes('animate-pulse'));
      expect(hasLoadingClass).toBe(true);
    });

    it('should show error message when there is an error', () => {
      mockUseDynamicAgentQuery.mockReturnValue({
        ...defaultMockQueryResult,
        data: undefined,
        error: new Error('Test error'),
      });

      render(<AgentGrid category="general" searchQuery="" onSelectAgent={mockOnSelectAgent} />);

      expect(screen.getByText('Error loading agents')).toBeInTheDocument();
    });

    it('should show loading spinner when fetching more data', () => {
      mockUseDynamicAgentQuery.mockReturnValue({
        ...defaultMockQueryResult,
        isFetching: true,
      });

      render(<AgentGrid category="general" searchQuery="" onSelectAgent={mockOnSelectAgent} />);

      // Should show agents and loading spinner for pagination
      expect(screen.getByText('Test Agent 1')).toBeInTheDocument();
      expect(screen.getByText('Test Agent 2')).toBeInTheDocument();
    });
  });

  describe('Agent Interaction', () => {
    it('should call onSelectAgent when agent card is clicked', () => {
      render(<AgentGrid category="general" searchQuery="" onSelectAgent={mockOnSelectAgent} />);

      const agentCard = screen.getByLabelText('Test Agent 1 agent card');
      fireEvent.click(agentCard);

      expect(mockOnSelectAgent).toHaveBeenCalledWith(mockAgents[0]);
    });
  });

  describe('Pagination', () => {
    it('should show "See More" button when hasMore is true', () => {
      mockUseDynamicAgentQuery.mockReturnValue({
        ...defaultMockQueryResult,
        data: {
          agents: mockAgents,
          pagination: {
            current: 1,
            hasMore: true,
            total: 10,
          },
        },
      });

      render(<AgentGrid category="general" searchQuery="" onSelectAgent={mockOnSelectAgent} />);

      expect(screen.getByText('See more')).toBeInTheDocument();
    });

    it('should not show "See More" button when hasMore is false', () => {
      mockUseDynamicAgentQuery.mockReturnValue({
        ...defaultMockQueryResult,
        data: {
          agents: mockAgents,
          pagination: {
            current: 1,
            hasMore: false,
            total: 2,
          },
        },
      });

      render(<AgentGrid category="general" searchQuery="" onSelectAgent={mockOnSelectAgent} />);

      expect(screen.queryByText('See more')).not.toBeInTheDocument();
    });
  });

  describe('Empty States', () => {
    it('should show empty state for search results', () => {
      mockUseDynamicAgentQuery.mockReturnValue({
        ...defaultMockQueryResult,
        data: {
          agents: [],
          pagination: { current: 1, hasMore: false, total: 0 },
        },
        queryType: 'search',
      });

      render(
        <AgentGrid category="all" searchQuery="no results" onSelectAgent={mockOnSelectAgent} />,
      );

      expect(screen.getByText('No agents found. Try another search term.')).toBeInTheDocument();
    });

    it('should show empty state for category with no agents', () => {
      mockUseDynamicAgentQuery.mockReturnValue({
        ...defaultMockQueryResult,
        data: {
          agents: [],
          pagination: { current: 1, hasMore: false, total: 0 },
        },
        queryType: 'category',
      });

      render(<AgentGrid category="hr" searchQuery="" onSelectAgent={mockOnSelectAgent} />);

      expect(screen.getByText('No agents found in this category')).toBeInTheDocument();
    });
  });
});
