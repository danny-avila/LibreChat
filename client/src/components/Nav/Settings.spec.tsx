import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Settings from './Settings';

const mockUseGetStartupConfig = jest.fn();

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => mockUseGetStartupConfig(),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/hooks/usePersonalizationAccess', () => ({
  __esModule: true,
  default: () => ({
    hasMemoryOptOut: false,
    hasAnyPersonalizationFeature: false,
  }),
}));

jest.mock('@librechat/client', () => ({
  GearIcon: () => <span aria-hidden="true" />,
  DataIcon: () => <span aria-hidden="true" />,
  UserIcon: () => <span aria-hidden="true" />,
  SpeechIcon: () => <span aria-hidden="true" />,
  PersonalizationIcon: () => <span aria-hidden="true" />,
  useMediaQuery: () => false,
}));

jest.mock('./SettingsTabs', () => ({
  General: () => <div data-testid="general-panel" />,
  Chat: () => <div data-testid="chat-panel" />,
  Commands: () => <div data-testid="commands-panel" />,
  Speech: () => <div data-testid="speech-panel" />,
  Personalization: () => <div data-testid="personalization-panel" />,
  Data: () => <div data-testid="data-panel" />,
  Balance: () => <div data-testid="balance-panel" />,
  Account: () => <div data-testid="account-panel" />,
  About: () => <div data-testid="about-panel" />,
}));

function renderSettings() {
  return render(<Settings open={true} onOpenChange={jest.fn()} />);
}

beforeEach(() => {
  mockUseGetStartupConfig.mockReturnValue({ data: {} });
});

describe('Settings', () => {
  it('shows the About tab while startup config is loading', () => {
    mockUseGetStartupConfig.mockReturnValue({ data: undefined });

    renderSettings();

    expect(screen.getByText('com_nav_setting_about')).toBeInTheDocument();
  });

  it('hides the About tab only when buildInfo is explicitly disabled', () => {
    mockUseGetStartupConfig.mockReturnValue({ data: { interface: { buildInfo: false } } });

    renderSettings();

    expect(screen.queryByText('com_nav_setting_about')).not.toBeInTheDocument();
  });

  it('resets the active tab when loaded config disables About', async () => {
    const user = userEvent.setup();
    const { rerender } = renderSettings();

    await user.click(screen.getByText('com_nav_setting_about'));
    expect(screen.getByTestId('about-panel')).toBeInTheDocument();

    mockUseGetStartupConfig.mockReturnValue({ data: { interface: { buildInfo: false } } });
    rerender(<Settings open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.queryByTestId('about-panel')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('general-panel')).toBeInTheDocument();
  });
});
