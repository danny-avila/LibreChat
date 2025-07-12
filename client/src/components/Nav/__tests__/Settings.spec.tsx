import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { QueryObserverResult } from '@tanstack/react-query';
import type { TStartupConfig } from 'librechat-data-provider';
import Settings from '../Settings';
import { useGetStartupConfig } from '~/data-provider';
import { useMediaQuery, useLocalize } from '~/hooks';
import usePersonalizationAccess from '~/hooks/usePersonalizationAccess';

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: jest.fn(),
}));

jest.mock('~/hooks', () => ({
  useMediaQuery: jest.fn(),
  useLocalize: jest.fn(),
}));

jest.mock('~/hooks/usePersonalizationAccess', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../SettingsTabs', () => ({
  General: () => <div data-testid="general-tab-content" />,
  Chat: () => <div data-testid="chat-tab-content" />,
  Speech: () => <div data-testid="speech-tab-content" />,
  Commands: () => <div data-testid="commands-tab-content" />,
  Data: () => <div data-testid="data-tab-content" />,
  Account: () => <div data-testid="account-tab-content" />,
  Balance: () => <div data-testid="balance-tab-content" />,
  Personalization: () => <div data-testid="personalization-tab-content" />,
}));

const mockOnOpenChange = jest.fn();
const mockLocalize = jest.fn((key) => key);
const mockUseGetStartupConfig = useGetStartupConfig as jest.MockedFunction<
  typeof useGetStartupConfig
>;
const mockUseMediaQuery = useMediaQuery as jest.MockedFunction<typeof useMediaQuery>;
const mockUseLocalize = useLocalize as jest.MockedFunction<typeof useLocalize>;
const mockUsePersonalizationAccess = usePersonalizationAccess as jest.MockedFunction<
  typeof usePersonalizationAccess
>;

const mockQueryResult: Partial<QueryObserverResult<TStartupConfig>> = {
  data: undefined,
  error: null,
  isError: false,
  isLoading: false,
  isLoadingError: false,
  isRefetchError: false,
  isSuccess: true,
  status: 'success' as const,
  dataUpdatedAt: Date.now(),
  errorUpdatedAt: 0,
  failureCount: 0,
  errorUpdateCount: 0,
  isFetched: true,
  isFetchedAfterMount: true,
  isFetching: false,
  isRefetching: false,
  isStale: false,
  refetch: jest.fn(),
  remove: jest.fn(),
  fetchStatus: 'idle' as const,
  failureReason: null,
  isPaused: false,
  isPlaceholderData: false,
  isInitialLoading: false,
  isPreviousData: false,
};

describe('Settings Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalize.mockReturnValue(mockLocalize);
    mockUseMediaQuery.mockReturnValue(false);
    mockUseGetStartupConfig.mockReturnValue(mockQueryResult as QueryObserverResult<TStartupConfig>);
    mockUsePersonalizationAccess.mockReturnValue({
      hasAnyPersonalizationFeature: false,
      hasMemoryOptOut: false,
    });
  });

  describe('rendering', () => {
    it('renders when open', () => {
      render(<Settings open={true} onOpenChange={mockOnOpenChange} />);
      expect(screen.getByText('com_nav_settings')).toBeInTheDocument();
    });

    it('does not render when closed', () => {
      render(<Settings open={false} onOpenChange={mockOnOpenChange} />);
      expect(screen.queryByText('com_nav_settings')).not.toBeInTheDocument();
    });

    it('renders all basic tabs', () => {
      render(<Settings open={true} onOpenChange={mockOnOpenChange} />);

      const tabLabels = [
        'com_nav_setting_general',
        'com_nav_setting_chat',
        'com_nav_setting_beta',
        'com_nav_commands',
        'com_nav_setting_speech',
        'com_nav_setting_data',
        'com_nav_setting_account',
      ];

      tabLabels.forEach((label) => {
        expect(screen.getByText(label)).toBeInTheDocument();
      });
    });

    it('renders balance tab when enabled in config', () => {
      mockUseGetStartupConfig.mockReturnValue({
        ...mockQueryResult,
        data: {
          balance: {
            enabled: true,
            startBalance: 0,
            autoRefillEnabled: false,
            refillIntervalValue: 0,
            refillIntervalUnit: 'days',
            refillAmount: 0,
          },
        } as TStartupConfig,
      } as QueryObserverResult<TStartupConfig>);

      render(<Settings open={true} onOpenChange={mockOnOpenChange} />);
      expect(screen.getByText('com_nav_setting_balance')).toBeInTheDocument();
    });

    it('does not render balance tab when disabled in config', () => {
      mockUseGetStartupConfig.mockReturnValue({
        ...mockQueryResult,
        data: {
          balance: {
            enabled: false,
            startBalance: 0,
            autoRefillEnabled: false,
            refillIntervalValue: 0,
            refillIntervalUnit: 'days',
            refillAmount: 0,
          },
        } as TStartupConfig,
      } as QueryObserverResult<TStartupConfig>);

      render(<Settings open={true} onOpenChange={mockOnOpenChange} />);
      expect(screen.queryByText('com_nav_setting_balance')).not.toBeInTheDocument();
    });

    it('renders personalization tab when features are available', () => {
      mockUsePersonalizationAccess.mockReturnValue({
        hasAnyPersonalizationFeature: true,
        hasMemoryOptOut: true,
      });

      render(<Settings open={true} onOpenChange={mockOnOpenChange} />);
      expect(screen.getByText('com_nav_setting_personalization')).toBeInTheDocument();
    });

    it('does not render personalization tab when features are unavailable', () => {
      mockUsePersonalizationAccess.mockReturnValue({
        hasAnyPersonalizationFeature: false,
        hasMemoryOptOut: false,
      });

      render(<Settings open={true} onOpenChange={mockOnOpenChange} />);
      expect(screen.queryByText('com_nav_setting_personalization')).not.toBeInTheDocument();
    });
  });

  describe('tab navigation', () => {
    it('shows general tab by default', () => {
      render(<Settings open={true} onOpenChange={mockOnOpenChange} />);
      expect(screen.getByTestId('general-tab-content')).toBeInTheDocument();
    });

    it('switches tabs on click', async () => {
      const user = userEvent.setup();
      render(<Settings open={true} onOpenChange={mockOnOpenChange} />);

      await user.click(screen.getByText('com_nav_setting_chat'));
      expect(screen.getByTestId('chat-tab-content')).toBeInTheDocument();

      await user.click(screen.getByText('com_nav_setting_account'));
      expect(screen.getByTestId('account-tab-content')).toBeInTheDocument();
    });

    it('navigates tabs with arrow keys', async () => {
      render(<Settings open={true} onOpenChange={mockOnOpenChange} />);
      const tabList = screen.getByLabelText('Settings');

      fireEvent.keyDown(tabList, { key: 'ArrowDown' });
      await waitFor(() => {
        expect(screen.getByTestId('chat-tab-content')).toBeInTheDocument();
      });

      fireEvent.keyDown(tabList, { key: 'ArrowUp' });
      await waitFor(() => {
        expect(screen.getByTestId('general-tab-content')).toBeInTheDocument();
      });
    });

    it('navigates to first tab with Home key', async () => {
      render(<Settings open={true} onOpenChange={mockOnOpenChange} />);
      const tabList = screen.getByLabelText('Settings');

      fireEvent.click(screen.getByText('com_nav_setting_account'));

      fireEvent.keyDown(tabList, { key: 'Home' });
      await waitFor(() => {
        expect(screen.getByTestId('general-tab-content')).toBeInTheDocument();
      });
    });

    it('navigates to last tab with End key', async () => {
      render(<Settings open={true} onOpenChange={mockOnOpenChange} />);
      const tabList = screen.getByLabelText('Settings');

      fireEvent.keyDown(tabList, { key: 'End' });
      await waitFor(() => {
        expect(screen.getByTestId('account-tab-content')).toBeInTheDocument();
      });
    });

    it('wraps around when navigating past last tab', async () => {
      render(<Settings open={true} onOpenChange={mockOnOpenChange} />);
      const tabList = screen.getByLabelText('Settings');

      fireEvent.keyDown(tabList, { key: 'End' });

      fireEvent.keyDown(tabList, { key: 'ArrowDown' });
      await waitFor(() => {
        expect(screen.getByTestId('general-tab-content')).toBeInTheDocument();
      });
    });

    it('wraps around when navigating before first tab', async () => {
      render(<Settings open={true} onOpenChange={mockOnOpenChange} />);
      const tabList = screen.getByLabelText('Settings');

      fireEvent.keyDown(tabList, { key: 'ArrowUp' });
      await waitFor(() => {
        expect(screen.getByTestId('account-tab-content')).toBeInTheDocument();
      });
    });
  });

  describe('dialog functionality', () => {
    it('calls onOpenChange when close button is clicked', async () => {
      const user = userEvent.setup();
      render(<Settings open={true} onOpenChange={mockOnOpenChange} />);

      const closeButton = screen.getByRole('button', { name: 'com_ui_close' });
      await user.click(closeButton);

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('calls onOpenChange when clicking outside dialog', async () => {
      const user = userEvent.setup();
      render(<Settings open={true} onOpenChange={mockOnOpenChange} />);

      const backdrop = screen
        .getByRole('dialog')
        .parentElement?.querySelector('[aria-hidden="true"]');
      if (backdrop) {
        await user.click(backdrop);
      }

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('responsive behavior', () => {
    it('applies small screen styles when on mobile', () => {
      mockUseMediaQuery.mockReturnValue(true);
      render(<Settings open={true} onOpenChange={mockOnOpenChange} />);

      const tabList = screen.getByLabelText('Settings');
      expect(tabList).toHaveClass('flex-row', 'rounded-xl', 'bg-surface-secondary');
    });

    it('applies large screen styles when on desktop', () => {
      mockUseMediaQuery.mockReturnValue(false);
      render(<Settings open={true} onOpenChange={mockOnOpenChange} />);

      const tabList = screen.getByLabelText('Settings');
      expect(tabList).toHaveClass('sticky', 'top-0', 'h-full');
    });
  });

  describe('Edge cases', () => {
    it('handles missing startup config gracefully', () => {
      mockUseGetStartupConfig.mockReturnValue(
        mockQueryResult as QueryObserverResult<TStartupConfig>,
      );

      render(<Settings open={true} onOpenChange={mockOnOpenChange} />);
      expect(screen.queryByText('com_nav_setting_balance')).not.toBeInTheDocument();
    });

    it('handles keyboard navigation with all optional tabs enabled', async () => {
      mockUseGetStartupConfig.mockReturnValue({
        ...mockQueryResult,
        data: {
          balance: {
            enabled: true,
            startBalance: 0,
            autoRefillEnabled: false,
            refillIntervalValue: 0,
            refillIntervalUnit: 'days',
            refillAmount: 0,
          },
        } as TStartupConfig,
      } as QueryObserverResult<TStartupConfig>);
      mockUsePersonalizationAccess.mockReturnValue({
        hasAnyPersonalizationFeature: true,
        hasMemoryOptOut: true,
      });

      render(<Settings open={true} onOpenChange={mockOnOpenChange} />);
      const tabList = screen.getByLabelText('Settings');

      expect(screen.getByText('com_nav_setting_personalization')).toBeInTheDocument();
      expect(screen.getByText('com_nav_setting_balance')).toBeInTheDocument();

      fireEvent.keyDown(tabList, { key: 'End' });
      await waitFor(() => {
        expect(screen.getByTestId('account-tab-content')).toBeInTheDocument();
      });

      fireEvent.keyDown(tabList, { key: 'Home' });
      await waitFor(() => {
        expect(screen.getByTestId('general-tab-content')).toBeInTheDocument();
      });
    });

    it('prevents default behavior for navigation keys', () => {
      render(<Settings open={true} onOpenChange={mockOnOpenChange} />);
      const tabList = screen.getByLabelText('Settings');

      const navigationKeys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

      navigationKeys.forEach((key) => {
        const event = new KeyboardEvent('keydown', { key, bubbles: true });
        const preventDefaultSpy = jest.spyOn(event, 'preventDefault');

        tabList.dispatchEvent(event);
        expect(preventDefaultSpy).toHaveBeenCalled();
      });
    });

    it('ignores non-navigation keys', () => {
      render(<Settings open={true} onOpenChange={mockOnOpenChange} />);
      const tabList = screen.getByLabelText('Settings');

      fireEvent.keyDown(tabList, { key: 'Enter' });
      expect(screen.getByTestId('general-tab-content')).toBeInTheDocument();

      fireEvent.keyDown(tabList, { key: 'a' });
      expect(screen.getByTestId('general-tab-content')).toBeInTheDocument();
    });

    it('maintains tab focus when switching tabs', async () => {
      const user = userEvent.setup();
      render(<Settings open={true} onOpenChange={mockOnOpenChange} />);

      const chatTab = screen.getByText('com_nav_setting_chat');
      await user.click(chatTab);

      expect(screen.getByTestId('chat-tab-content')).toBeInTheDocument();

      const chatTabTrigger = screen.getByRole('tab', { name: 'com_nav_setting_chat' });
      expect(chatTabTrigger).toHaveAttribute('data-state', 'active');
    });
  });
});
