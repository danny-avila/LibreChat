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
  General: () => <div>general-panel</div>,
  Chat: () => <div>chat-panel</div>,
  Commands: () => <div>commands-panel</div>,
  Speech: () => <div>speech-panel</div>,
  Personalization: () => <div>personalization-panel</div>,
  Data: () => <div>data-panel</div>,
  Balance: () => <div>balance-panel</div>,
  Account: () => <div>account-panel</div>,
  About: () => <div>about-panel</div>,
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
    expect(screen.getByText('about-panel')).toBeInTheDocument();

    mockUseGetStartupConfig.mockReturnValue({ data: { interface: { buildInfo: false } } });
    rerender(<Settings open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.queryByText('about-panel')).not.toBeInTheDocument();
    });
    expect(screen.getByText('general-panel')).toBeInTheDocument();
  });
});
