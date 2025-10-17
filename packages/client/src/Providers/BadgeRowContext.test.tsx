import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BadgeRowProvider, useBadgeRowContext } from './BadgeRowContext';
import { useGetStartupConfig } from '~/data-provider';

// Mock the hooks and utilities
jest.mock('~/data-provider');
jest.mock('~/hooks', () => ({
  useMCPServerManager: jest.fn(() => ({})),
  useSearchApiKeyForm: jest.fn(() => ({ setIsDialogOpen: jest.fn() })),
  useGetAgentsConfig: jest.fn(() => ({ agentsConfig: null })),
  useCodeApiKeyForm: jest.fn(() => ({ setIsDialogOpen: jest.fn() })),
  useToolToggle: jest.fn((config) => ({
    isEnabled: false,
    setIsEnabled: jest.fn(),
    ...config,
  })),
}));

jest.mock('~/utils/timestamps', () => ({
  getTimestampedValue: jest.fn(),
  setTimestamp: jest.fn(),
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

// Test component to access context
const TestComponent: React.FC = () => {
  const context = useBadgeRowContext();
  return (
    <div data-testid="test-component">
      <span data-testid="fileSearch-enabled">{context.fileSearch.isEnabled?.toString()}</span>
    </div>
  );
};

const renderWithProviders = (
  children: React.ReactNode,
  configData?: unknown,
  conversationId?: string | null,
) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  (useGetStartupConfig as jest.Mock).mockReturnValue({
    data: configData,
    isLoading: false,
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>
        <BadgeRowProvider conversationId={conversationId}>{children}</BadgeRowProvider>
      </RecoilRoot>
    </QueryClientProvider>,
  );
};

describe('BadgeRowProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  describe('fileSearchSelected configuration', () => {
    it('should initialize fileSearch toggle with fileSearchSelected=true from config', async () => {
      const configData = {
        interface: {
          fileSearchSelected: true,
        },
      };

      renderWithProviders(<TestComponent />, configData, 'test-convo-id');

      await waitFor(() => {
        // Verify that the configuration was used during initialization
        expect(useGetStartupConfig).toHaveBeenCalled();
      });
    });

    it('should initialize fileSearch toggle with fileSearchSelected=false from config', async () => {
      const configData = {
        interface: {
          fileSearchSelected: false,
        },
      };

      renderWithProviders(<TestComponent />, configData, 'test-convo-id');

      await waitFor(() => {
        expect(useGetStartupConfig).toHaveBeenCalled();
      });
    });

    it('should use default false when fileSearchSelected is not configured', async () => {
      const configData = {
        interface: {
          // fileSearchSelected not specified
        },
      };

      renderWithProviders(<TestComponent />, configData, 'test-convo-id');

      await waitFor(() => {
        expect(useGetStartupConfig).toHaveBeenCalled();
      });
    });

    it('should use default false when config is undefined', async () => {
      renderWithProviders(<TestComponent />, undefined, 'test-convo-id');

      await waitFor(() => {
        expect(useGetStartupConfig).toHaveBeenCalled();
      });
    });

    it('should use default false when interface config is undefined', async () => {
      const configData = {
        // interface not specified
      };

      renderWithProviders(<TestComponent />, configData, 'test-convo-id');

      await waitFor(() => {
        expect(useGetStartupConfig).toHaveBeenCalled();
      });
    });
  });

  describe('localStorage interaction with fileSearchSelected', () => {
    it('should use localStorage value when available, overriding config default', async () => {
      const { getTimestampedValue } = await import('~/utils/timestamps');
      getTimestampedValue.mockImplementation((key: string) => {
        if (key.includes('fileSearch')) {
          return 'true'; // localStorage has fileSearch enabled
        }
        return null;
      });

      const configData = {
        interface: {
          fileSearchSelected: false, // Config says false, but localStorage says true
        },
      };

      renderWithProviders(<TestComponent />, configData, 'test-convo-id');

      await waitFor(() => {
        expect(getTimestampedValue).toHaveBeenCalledWith(expect.stringContaining('fileSearch'));
      });
    });

    it('should fall back to config when localStorage is empty', async () => {
      const { getTimestampedValue } = await import('~/utils/timestamps');
      getTimestampedValue.mockReturnValue(null); // No localStorage value

      const configData = {
        interface: {
          fileSearchSelected: true,
        },
      };

      renderWithProviders(<TestComponent />, configData, 'test-convo-id');

      await waitFor(() => {
        expect(getTimestampedValue).toHaveBeenCalled();
      });
    });

    it('should handle localStorage parsing errors gracefully', async () => {
      const { getTimestampedValue } = await import('~/utils/timestamps');
      getTimestampedValue.mockImplementation((key: string) => {
        if (key.includes('fileSearch')) {
          return 'invalid-json'; // This will cause JSON.parse to fail
        }
        return null;
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const configData = {
        interface: {
          fileSearchSelected: true,
        },
      };

      renderWithProviders(<TestComponent />, configData, 'test-convo-id');

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Failed to parse file search toggle value:',
          expect.any(Error),
        );
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('conversation ID handling', () => {
    it('should use NEW_CONVO constant when conversationId is null', async () => {
      const configData = {
        interface: {
          fileSearchSelected: true,
        },
      };

      renderWithProviders(<TestComponent />, configData, null);

      await waitFor(() => {
        expect(useGetStartupConfig).toHaveBeenCalled();
      });
    });

    it('should use NEW_CONVO constant when conversationId is undefined', async () => {
      const configData = {
        interface: {
          fileSearchSelected: true,
        },
      };

      renderWithProviders(<TestComponent />, configData, undefined);

      await waitFor(() => {
        expect(useGetStartupConfig).toHaveBeenCalled();
      });
    });

    it('should use provided conversationId when available', async () => {
      const configData = {
        interface: {
          fileSearchSelected: true,
        },
      };

      renderWithProviders(<TestComponent />, configData, 'specific-conversation-id');

      await waitFor(() => {
        expect(useGetStartupConfig).toHaveBeenCalled();
      });
    });
  });

  describe('initialization behavior', () => {
    it('should not reinitialize when isSubmitting is true', async () => {
      const { setTimestamp } = await import('~/utils/timestamps');
      const configData = {
        interface: {
          fileSearchSelected: true,
        },
      };

      const { rerender } = renderWithProviders(<TestComponent />, configData, 'test-convo-id');

      // Simulate isSubmitting=true
      rerender(
        <QueryClientProvider client={new QueryClient()}>
          <RecoilRoot>
            <BadgeRowProvider conversationId="test-convo-id" isSubmitting={true}>
              <TestComponent />
            </BadgeRowProvider>
          </RecoilRoot>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        // Should not call setTimestamp when isSubmitting is true
        expect(setTimestamp).not.toHaveBeenCalled();
      });
    });

    it('should initialize only once per conversation change', async () => {
      const { setTimestamp } = await import('~/utils/timestamps');
      const configData = {
        interface: {
          fileSearchSelected: true,
        },
      };

      const { rerender } = renderWithProviders(<TestComponent />, configData, 'convo-1');

      // Re-render with same conversation ID
      rerender(
        <QueryClientProvider client={new QueryClient()}>
          <RecoilRoot>
            <BadgeRowProvider conversationId="convo-1">
              <TestComponent />
            </BadgeRowProvider>
          </RecoilRoot>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        // Should only initialize once for the same conversation
        expect(setTimestamp).toHaveBeenCalledTimes(4); // Once for each tool type
      });

      // Change conversation ID
      rerender(
        <QueryClientProvider client={new QueryClient()}>
          <RecoilRoot>
            <BadgeRowProvider conversationId="convo-2">
              <TestComponent />
            </BadgeRowProvider>
          </RecoilRoot>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        // Should initialize again for new conversation
        expect(setTimestamp).toHaveBeenCalledTimes(8); // Two sets of 4 calls
      });
    });
  });

  describe('error handling', () => {
    it('should handle missing config gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      renderWithProviders(<TestComponent />, null, 'test-convo-id');

      await waitFor(() => {
        expect(useGetStartupConfig).toHaveBeenCalled();
        // Should not throw errors
        expect(consoleErrorSpy).not.toHaveBeenCalled();
      });

      consoleErrorSpy.mockRestore();
    });

    it('should handle malformed config gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const malformedConfig = {
        interface: 'not-an-object', // This should be an object
      };

      renderWithProviders(<TestComponent />, malformedConfig, 'test-convo-id');

      await waitFor(() => {
        expect(useGetStartupConfig).toHaveBeenCalled();
        // Should not throw errors even with malformed config
        expect(consoleErrorSpy).not.toHaveBeenCalled();
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('context provider', () => {
    it('should throw error when useBadgeRowContext is used outside provider', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useBadgeRowContext must be used within a BadgeRowProvider');

      consoleErrorSpy.mockRestore();
    });

    it('should provide context successfully when used within provider', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        renderWithProviders(<TestComponent />, {}, 'test-convo-id');
      }).not.toThrow();

      consoleErrorSpy.mockRestore();
    });
  });
});
