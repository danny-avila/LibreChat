import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorDisplay } from '../ErrorDisplay';

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock the localize hook
const mockLocalize = jest.fn((key: string, options?: any) => {
  const translations: Record<string, string> = {
    com_agents_error_title: 'Something went wrong',
    com_agents_error_generic: 'We encountered an issue while loading the content.',
    com_agents_error_suggestion_generic: 'Please try refreshing the page or try again later.',
    com_agents_error_network_title: 'Connection Problem',
    com_agents_error_network_message: 'Unable to connect to the server.',
    com_agents_error_network_suggestion: 'Check your internet connection and try again.',
    com_agents_error_not_found_title: 'Not Found',
    com_agents_error_not_found_message: 'The requested content could not be found.',
    com_agents_error_not_found_suggestion:
      'Try browsing other options or go back to the marketplace.',
    com_agents_error_invalid_request: 'Invalid Request',
    com_agents_error_bad_request_message: 'The request could not be processed.',
    com_agents_error_bad_request_suggestion: 'Please check your input and try again.',
    com_agents_error_server_title: 'Server Error',
    com_agents_error_server_message: 'The server is temporarily unavailable.',
    com_agents_error_server_suggestion: 'Please try again in a few moments.',
    com_agents_error_search_title: 'Search Error',
    com_agents_error_category_title: 'Category Error',
    com_agents_error_timeout_title: 'Connection Timeout',
    com_agents_error_timeout_message: 'The request took too long to complete.',
    com_agents_error_timeout_suggestion: 'Please check your internet connection and try again.',
    com_agents_search_no_results: `No agents found for "${options?.query}"`,
    com_agents_category_empty: `No agents found in the ${options?.category} category`,
    com_agents_error_retry: 'Try Again',
  };

  return translations[key] || key;
});

jest.mock('~/hooks/useLocalize', () => () => mockLocalize);

describe('ErrorDisplay', () => {
  beforeEach(() => {
    mockLocalize.mockClear();
  });

  describe('Backend error responses', () => {
    it('displays user-friendly message from backend response', () => {
      const error = {
        response: {
          data: {
            userMessage: 'Unable to load agents. Please try refreshing the page.',
            suggestion: 'Try refreshing the page or check your network connection',
          },
        },
      };

      render(<ErrorDisplay error={error} />);

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(
        screen.getByText('Unable to load agents. Please try refreshing the page.'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('💡 Try refreshing the page or check your network connection'),
      ).toBeInTheDocument();
    });

    it('handles search context with backend response', () => {
      const error = {
        response: {
          data: {
            userMessage: 'Search is temporarily unavailable. Please try again.',
            suggestion: 'Try a different search term or check your network connection',
          },
        },
      };

      render(<ErrorDisplay error={error} context={{ searchQuery: 'test query' }} />);

      expect(screen.getByText('Search Error')).toBeInTheDocument();
      expect(
        screen.getByText('Search is temporarily unavailable. Please try again.'),
      ).toBeInTheDocument();
    });
  });

  describe('Network errors', () => {
    it('displays network error message', () => {
      const error = {
        code: 'NETWORK_ERROR',
        message: 'Network Error',
      };

      render(<ErrorDisplay error={error} />);

      expect(screen.getByText('Connection Problem')).toBeInTheDocument();
      expect(screen.getByText('Unable to connect to the server.')).toBeInTheDocument();
      expect(
        screen.getByText('💡 Check your internet connection and try again.'),
      ).toBeInTheDocument();
    });

    it('handles timeout errors', () => {
      const error = {
        code: 'ECONNABORTED',
        message: 'timeout of 5000ms exceeded',
      };

      render(<ErrorDisplay error={error} />);

      expect(mockLocalize).toHaveBeenCalledWith('com_agents_error_timeout_title');
      expect(mockLocalize).toHaveBeenCalledWith('com_agents_error_timeout_message');
      expect(mockLocalize).toHaveBeenCalledWith('com_agents_error_timeout_suggestion');
    });
  });

  describe('HTTP status codes', () => {
    it('handles 404 errors with search context', () => {
      const error = {
        response: {
          status: 404,
          data: {},
        },
      };

      render(<ErrorDisplay error={error} context={{ searchQuery: 'nonexistent agent' }} />);

      expect(screen.getByText('Not Found')).toBeInTheDocument();
      expect(screen.getByText('No agents found for "nonexistent agent"')).toBeInTheDocument();
    });

    it('handles 404 errors with category context', () => {
      const error = {
        response: {
          status: 404,
          data: {},
        },
      };

      render(<ErrorDisplay error={error} context={{ category: 'productivity' }} />);

      expect(screen.getByText('Not Found')).toBeInTheDocument();
      expect(screen.getByText('No agents found in the productivity category')).toBeInTheDocument();
    });

    it('handles 400 bad request errors', () => {
      const error = {
        response: {
          status: 400,
          data: {
            error: 'Search query is required',
            userMessage: 'Please enter a search term to find agents',
            suggestion: 'Enter a search term to find agents by name or description',
          },
        },
      };

      render(<ErrorDisplay error={error} />);

      expect(screen.getByText('Invalid Request')).toBeInTheDocument();
      expect(screen.getByText('Please enter a search term to find agents')).toBeInTheDocument();
      expect(
        screen.getByText('💡 Enter a search term to find agents by name or description'),
      ).toBeInTheDocument();
    });

    it('handles 500 server errors', () => {
      const error = {
        response: {
          status: 500,
          data: {},
        },
      };

      render(<ErrorDisplay error={error} />);

      expect(screen.getByText('Server Error')).toBeInTheDocument();
      expect(screen.getByText('The server is temporarily unavailable.')).toBeInTheDocument();
      expect(screen.getByText('💡 Please try again in a few moments.')).toBeInTheDocument();
    });
  });

  describe('Retry functionality', () => {
    it('displays retry button when onRetry is provided', () => {
      const mockRetry = jest.fn();
      const error = {
        response: {
          data: {
            userMessage: 'Unable to load agents. Please try refreshing the page.',
          },
        },
      };

      render(<ErrorDisplay error={error} onRetry={mockRetry} />);

      const retryButton = screen.getByText('Try Again');
      expect(retryButton).toBeInTheDocument();

      fireEvent.click(retryButton);
      expect(mockRetry).toHaveBeenCalledTimes(1);
    });

    it('does not display retry button when onRetry is not provided', () => {
      const error = {
        response: {
          data: {
            userMessage: 'Unable to load agents. Please try refreshing the page.',
          },
        },
      };

      render(<ErrorDisplay error={error} />);

      expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
    });
  });

  describe('Context-aware titles', () => {
    it('shows search error title for search context', () => {
      const error = { message: 'Some error' };

      render(<ErrorDisplay error={error} context={{ searchQuery: 'test' }} />);

      expect(mockLocalize).toHaveBeenCalledWith('com_agents_error_search_title');
    });

    it('shows category error title for category context', () => {
      const error = { message: 'Some error' };

      render(<ErrorDisplay error={error} context={{ category: 'productivity' }} />);

      expect(mockLocalize).toHaveBeenCalledWith('com_agents_error_category_title');
    });

    it('shows generic error title when no context', () => {
      const error = { message: 'Some error' };

      render(<ErrorDisplay error={error} />);

      expect(mockLocalize).toHaveBeenCalledWith('com_agents_error_title');
    });
  });

  describe('Fallback error handling', () => {
    it('handles unknown errors gracefully', () => {
      const error = {
        message: 'Unknown error occurred',
      };

      render(<ErrorDisplay error={error} />);

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(
        screen.getByText('We encountered an issue while loading the content.'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('💡 Please try refreshing the page or try again later.'),
      ).toBeInTheDocument();
    });

    it('handles null/undefined errors', () => {
      render(<ErrorDisplay error={null} />);

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(
        screen.getByText('We encountered an issue while loading the content.'),
      ).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('renders error icon with proper accessibility', () => {
      const error = { message: 'Test error' };

      render(<ErrorDisplay error={error} />);

      const errorIcon = screen.getByRole('img', { hidden: true });
      expect(errorIcon).toBeInTheDocument();
    });

    it('has proper heading structure', () => {
      const error = { message: 'Test error' };

      render(<ErrorDisplay error={error} />);

      const heading = screen.getByRole('heading', { level: 3 });
      expect(heading).toHaveTextContent('Something went wrong');
    });
  });
});
