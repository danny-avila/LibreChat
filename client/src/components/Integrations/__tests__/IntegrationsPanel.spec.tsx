import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import IntegrationsPanel from '../IntegrationsPanel';

jest.mock('~/hooks', () => ({
  useLocalize: jest.fn(),
  useUploadTypeItems: jest.fn(),
  useIntegrationPickers: jest.fn(),
  useIntegrationConnectors: jest.fn(),
}));

jest.mock('~/data-provider', () => ({
  useGetFileConfig: jest.fn(),
  useGetStartupConfig: jest.fn(),
  useIntegrationsQuery: jest.fn(),
  useGetEndpointsQuery: jest.fn(),
}));

jest.mock('~/Providers', () => ({
  useChatContext: jest.fn(),
}));

jest.mock('../IntegrationPickerDialogs', () => ({
  IntegrationPickerDialogs: () => null,
}));

jest.mock('../IntegrationProviderIcon', () => ({
  IntegrationProviderIcon: () => null,
}));

jest.mock('@ariakit/react', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  return {
    MenuButton: (props) => R.createElement('button', props, props.children),
  };
});

jest.mock('@librechat/client', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  return {
    Button: (props) => R.createElement('button', props, props.children),
    Spinner: () => R.createElement('span', { 'data-testid': 'spinner' }),
    OGDialog: (props) => R.createElement('div', null, props.children),
    OGDialogContent: (props) => R.createElement('div', null, props.children),
    OGDialogTitle: (props) => R.createElement('div', null, props.children),
    OGDialogDescription: (props) => R.createElement('div', null, props.children),
    DropdownPopup: (props) =>
      R.createElement(
        'div',
        null,
        R.createElement('div', { onClick: () => props.setIsOpen(!props.isOpen) }, props.trigger),
        props.isOpen &&
          R.createElement(
            'div',
            { 'data-testid': 'dropdown-menu' },
            props.items.map((item, idx) =>
              R.createElement(
                'button',
                { key: idx, onClick: item.onClick, 'data-testid': `menu-item-${item.label}` },
                item.label,
              ),
            ),
          ),
      ),
  };
});

const mockUseLocalize = jest.requireMock('~/hooks').useLocalize;
const mockUseUploadTypeItems = jest.requireMock('~/hooks').useUploadTypeItems;
const mockUseIntegrationPickers = jest.requireMock('~/hooks').useIntegrationPickers;
const mockUseIntegrationConnectors = jest.requireMock('~/hooks').useIntegrationConnectors;
const mockUseGetFileConfig = jest.requireMock('~/data-provider').useGetFileConfig;
const mockUseGetStartupConfig = jest.requireMock('~/data-provider').useGetStartupConfig;
const mockUseIntegrationsQuery = jest.requireMock('~/data-provider').useIntegrationsQuery;
const mockUseGetEndpointsQuery = jest.requireMock('~/data-provider').useGetEndpointsQuery;
const mockUseChatContext = jest.requireMock('~/Providers').useChatContext;

const openDrivePicker = jest.fn();

function setupMocks(integrations: Array<Record<string, unknown>>) {
  const translations: Record<string, string> = {
    com_integrations_google_drive: 'Google Drive',
    com_integrations_box: 'Box',
    com_integrations_status_connected: 'Connected',
    com_integrations_connect_button: 'Connect',
    com_integrations_reconnect_button: 'Reconnect',
    com_ui_upload_image_input: 'Upload Image',
  };
  mockUseLocalize.mockReturnValue((key: string, params?: { provider?: string }) => {
    if (key === 'com_integrations_attach_files') {
      return `Attach files from ${params?.provider ?? ''}`;
    }
    return translations[key] || key;
  });
  mockUseUploadTypeItems.mockReturnValue((open: () => void) => [
    { id: 'upload-image', label: 'Upload Image', onClick: open },
  ]);
  mockUseIntegrationPickers.mockReturnValue({
    openers: {
      openDrivePicker,
      openDropboxPicker: jest.fn(),
      openBoxPicker: jest.fn(),
      openClioPicker: jest.fn(),
      openMicrosoftOneDrivePicker: jest.fn(),
      openMicrosoftOutlookMailPicker: jest.fn(),
      openMicrosoftOutlookCalendarPicker: jest.fn(),
      openGmailPicker: jest.fn(),
      openCalendarPicker: jest.fn(),
    },
    setToolResource: jest.fn(),
    handleFileChange: jest.fn(),
    dialogProps: {},
  });
  mockUseIntegrationConnectors.mockReturnValue({});
  mockUseGetFileConfig.mockReturnValue({ data: null });
  mockUseGetStartupConfig.mockReturnValue({ data: { integrationsEnabled: true } });
  mockUseIntegrationsQuery.mockReturnValue({ data: { integrations }, isLoading: false });
  mockUseGetEndpointsQuery.mockReturnValue({ data: undefined });
  mockUseChatContext.mockReturnValue({
    files: new Map(),
    setFiles: jest.fn(),
    setFilesLoading: jest.fn(),
    conversation: null,
  });
}

describe('IntegrationsPanel', () => {
  beforeEach(jest.clearAllMocks);

  it('shows an attach button for a connected provider and opens its picker menu', () => {
    setupMocks([
      {
        providerKey: 'google-drive',
        enabled: true,
        status: 'connected',
        labelKey: 'com_integrations_google_drive',
      },
    ]);
    render(<IntegrationsPanel />);

    const attachButton = screen.getByRole('button', { name: 'Attach files from Google Drive' });
    expect(attachButton).toBeInTheDocument();

    fireEvent.click(attachButton);
    const uploadItem = screen.getByTestId('menu-item-Upload Image');
    expect(uploadItem).toBeInTheDocument();

    fireEvent.click(uploadItem);
    expect(openDrivePicker).toHaveBeenCalledTimes(1);
  });

  it('does not show an attach button for a provider that is not connected', () => {
    setupMocks([
      {
        providerKey: 'box',
        enabled: true,
        status: 'not_connected',
        labelKey: 'com_integrations_box',
      },
    ]);
    render(<IntegrationsPanel />);

    expect(screen.getByText('Box')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Attach files from Box' })).not.toBeInTheDocument();
  });
});
