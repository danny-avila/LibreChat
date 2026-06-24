import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EModelEndpoint, EToolResources, Providers } from 'librechat-data-provider';
import AttachFileMenu from '../AttachFileMenu';

jest.mock('~/hooks', () => ({
  useAgentToolPermissions: jest.fn(),
  useAgentCapabilities: jest.fn(),
  useGetAgentsConfig: jest.fn(),
  useFileHandlingNoChatContext: jest.fn(),
  useLocalize: jest.fn(),
  useIntegrationConnectors: jest.fn(),
}));

jest.mock('~/hooks/Files/useSharePointFileHandling', () => ({
  __esModule: true,
  default: jest.fn(),
  useSharePointFileHandlingNoChatContext: jest.fn(),
}));

jest.mock('~/hooks/Files/useGoogleDriveFileHandling', () => ({
  __esModule: true,
  default: jest.fn(),
  useGoogleDriveFileHandlingNoChatContext: jest.fn(),
}));

jest.mock('~/hooks/Files/useDropboxFileHandling', () => ({
  __esModule: true,
  default: jest.fn(),
  useDropboxFileHandlingNoChatContext: jest.fn(),
}));

jest.mock('~/hooks/Files/useBoxFileHandling', () => ({
  __esModule: true,
  default: jest.fn(),
  useBoxFileHandlingNoChatContext: jest.fn(),
}));

jest.mock('~/hooks/Files/useClioFileHandling', () => ({
  __esModule: true,
  default: jest.fn(),
  useClioFileHandlingNoChatContext: jest.fn(),
}));

jest.mock('~/hooks/Files/useMicrosoftOneDriveFileHandling', () => ({
  __esModule: true,
  default: jest.fn(),
  useMicrosoftOneDriveFileHandlingNoChatContext: jest.fn(),
}));

jest.mock('~/hooks/Files/useIntegrationTextAttachHandling', () => ({
  __esModule: true,
  default: jest.fn(),
  useIntegrationTextAttachHandlingNoChatContext: jest.fn(),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: jest.fn(),
  useIntegrationsQuery: jest.fn(),
}));

jest.mock('~/components/SharePoint', () => ({
  SharePointPickerDialog: () => null,
}));

jest.mock('~/components/Integrations', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  const actual = jest.requireActual('~/components/Integrations/buildAttachIntegrationMenuItems');
  return {
    ConnectProviderPrompt: () => null,
    GoogleDrivePickerDialog: () => null,
    DropboxPickerDialog: () => null,
    BoxPickerDialog: () => null,
    ClioPickerDialog: () => null,
    MicrosoftOneDrivePickerDialog: () => null,
    MicrosoftOutlookMailPickerDialog: () => null,
    MicrosoftOutlookCalendarPickerDialog: () => null,
    GmailPickerDialog: () => null,
    GoogleCalendarPickerDialog: () => null,
    buildAttachIntegrationMenuItems: actual.buildAttachIntegrationMenuItems,
    INTEGRATION_ATTACH_MENU: {
      'google-drive': {
        menuLabelKey: 'com_files_upload_google_drive',
        Icon: () => R.createElement('span', { 'data-testid': 'google-drive-icon' }),
      },
    },
    INTEGRATION_PICKER_PROVIDER_KEYS: new Set(['google-drive', 'google-mail', 'google-calendar']),
    getIntegrationAttachMenuLabelKey: (providerKey: string, isConnected: boolean) => {
      if (providerKey === 'google-drive' && isConnected) {
        return 'com_files_upload_google_drive';
      }
      if (providerKey === 'google-drive') {
        return 'com_files_connect_google_drive';
      }
      return 'com_files_upload_google_drive';
    },
  };
});

jest.mock('~/components/Integrations/IntegrationProviderIcon', () => ({
  IntegrationProviderIcon: () => null,
}));

jest.mock('@librechat/client', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  const actual = jest.requireActual('@librechat/client');
  return {
    ...actual,
    FileUpload: R.forwardRef((props, ref) =>
      R.createElement(
        'div',
        { 'data-testid': 'file-upload' },
        props.children,
        R.createElement('input', {
          ref,
          multiple: true,
          type: 'file',
          'data-testid': 'file-input',
          onChange: props.handleFileChange,
        }),
      ),
    ),
    TooltipAnchor: (props) => props.render,
    DropdownPopup: (props) => {
      const renderMenuItems = (items, prefix = 'item', depth = 0) =>
        items.flatMap((item, idx) => {
          if (item.separate) {
            return [];
          }
          if (item.header) {
            return item.label
              ? [
                  R.createElement(
                    'div',
                    { key: `${prefix}-header-${idx}`, 'data-testid': `menu-header-${item.label}` },
                    item.label,
                  ),
                ]
              : [];
          }
          const testIdPrefix = depth === 0 ? 'menu-item' : 'submenu-item';
          const nodes = [
            R.createElement(
              'button',
              {
                key: `${prefix}-${idx}`,
                onClick: item.onClick,
                'data-testid': `${testIdPrefix}-${item.label ?? idx}`,
              },
              item.label,
            ),
          ];
          if (item.subItems?.length) {
            nodes.push(...renderMenuItems(item.subItems, `${prefix}-${idx}-sub`, depth + 1));
          }
          return nodes;
        });

      return R.createElement(
        'div',
        null,
        R.createElement('div', { onClick: () => props.setIsOpen(!props.isOpen) }, props.trigger),
        props.isOpen &&
          R.createElement('div', { 'data-testid': 'dropdown-menu' }, renderMenuItems(props.items)),
      );
    },
    AttachmentIcon: () => R.createElement('span', { 'data-testid': 'attachment-icon' }),
    SharePointIcon: () => R.createElement('span', { 'data-testid': 'sharepoint-icon' }),
    useToastContext: () => ({ showToast: jest.fn() }),
  };
});

jest.mock('@ariakit/react', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  return {
    MenuButton: (props) => R.createElement('button', props, props.children),
  };
});

const mockUseAgentToolPermissions = jest.requireMock('~/hooks').useAgentToolPermissions;
const mockUseAgentCapabilities = jest.requireMock('~/hooks').useAgentCapabilities;
const mockUseGetAgentsConfig = jest.requireMock('~/hooks').useGetAgentsConfig;
const mockUseFileHandlingNoChatContext = jest.requireMock('~/hooks').useFileHandlingNoChatContext;
const mockUseLocalize = jest.requireMock('~/hooks').useLocalize;
const mockUseSharePointFileHandling = jest.requireMock(
  '~/hooks/Files/useSharePointFileHandling',
).default;
const mockUseSharePointFileHandlingNoChatContext = jest.requireMock(
  '~/hooks/Files/useSharePointFileHandling',
).useSharePointFileHandlingNoChatContext;
const mockUseGoogleDriveFileHandlingNoChatContext = jest.requireMock(
  '~/hooks/Files/useGoogleDriveFileHandling',
).useGoogleDriveFileHandlingNoChatContext;
const mockUseDropboxFileHandlingNoChatContext = jest.requireMock(
  '~/hooks/Files/useDropboxFileHandling',
).useDropboxFileHandlingNoChatContext;
const mockUseBoxFileHandlingNoChatContext = jest.requireMock(
  '~/hooks/Files/useBoxFileHandling',
).useBoxFileHandlingNoChatContext;
const mockUseClioFileHandlingNoChatContext = jest.requireMock(
  '~/hooks/Files/useClioFileHandling',
).useClioFileHandlingNoChatContext;
const mockUseMicrosoftOneDriveFileHandlingNoChatContext = jest.requireMock(
  '~/hooks/Files/useMicrosoftOneDriveFileHandling',
).useMicrosoftOneDriveFileHandlingNoChatContext;
const mockUseIntegrationTextAttachHandlingNoChatContext = jest.requireMock(
  '~/hooks/Files/useIntegrationTextAttachHandling',
).useIntegrationTextAttachHandlingNoChatContext;
const mockUseGetStartupConfig = jest.requireMock('~/data-provider').useGetStartupConfig;
const mockUseIntegrationsQuery = jest.requireMock('~/data-provider').useIntegrationsQuery;
const mockUseIntegrationConnectors = jest.requireMock('~/hooks').useIntegrationConnectors;

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function setupMocks(overrides: { provider?: string } = {}) {
  const translations: Record<string, string> = {
    com_files_upload_google_drive: 'Google Drive',
    com_files_connect_google_drive: 'Google Drive',
    com_files_upload_sharepoint: 'SharePoint',
    com_attach_menu_section_upload: 'Upload',
    com_attach_menu_section_cloud: 'Connected accounts',
    com_attach_menu_google: 'Google',
    com_files_from_google_drive: 'Google Drive',
    com_sidepanel_attach_files: 'Attach Files',
    com_ui_upload_code_environment: 'Upload to Code Environment',
    com_ui_upload_file_search: 'Upload for File Search',
    com_ui_upload_image_input: 'Upload Image',
    com_ui_upload_ocr_text: 'Upload as Text',
    com_ui_upload_provider: 'Upload as attachment',
  };
  mockUseLocalize.mockReturnValue((key: string) => translations[key] || key);
  mockUseAgentCapabilities.mockReturnValue({
    contextEnabled: false,
    fileSearchEnabled: false,
    codeEnabled: false,
  });
  mockUseGetAgentsConfig.mockReturnValue({ agentsConfig: {} });
  mockUseFileHandlingNoChatContext.mockReturnValue({ handleFileChange: jest.fn() });
  const sharePointReturnValue = {
    handleSharePointFiles: jest.fn(),
    isProcessing: false,
    downloadProgress: 0,
    error: null,
  };
  mockUseSharePointFileHandling.mockReturnValue(sharePointReturnValue);
  mockUseSharePointFileHandlingNoChatContext.mockReturnValue(sharePointReturnValue);
  mockUseGoogleDriveFileHandlingNoChatContext.mockReturnValue({
    handleGoogleDriveFiles: jest.fn(),
    isProcessing: false,
    error: null,
  });
  mockUseDropboxFileHandlingNoChatContext.mockReturnValue({
    handleDropboxFiles: jest.fn(),
    isProcessing: false,
    error: null,
  });
  mockUseBoxFileHandlingNoChatContext.mockReturnValue({
    handleBoxFiles: jest.fn(),
    isProcessing: false,
    error: null,
  });
  mockUseClioFileHandlingNoChatContext.mockReturnValue({
    handleClioFiles: jest.fn(),
    isProcessing: false,
    error: null,
  });
  mockUseMicrosoftOneDriveFileHandlingNoChatContext.mockReturnValue({
    handleMicrosoftOneDriveFiles: jest.fn(),
    isProcessing: false,
    error: null,
  });
  mockUseIntegrationTextAttachHandlingNoChatContext.mockReturnValue({
    attachGmailMessages: jest.fn(),
    attachCalendarEvents: jest.fn(),
    attachOutlookMailMessages: jest.fn(),
    attachOutlookCalendarEvents: jest.fn(),
    isProcessing: false,
    error: null,
  });
  mockUseGetStartupConfig.mockReturnValue({
    data: { sharePointFilePickerEnabled: false, integrationsEnabled: false },
  });
  mockUseIntegrationsQuery.mockReturnValue({ data: { integrations: [] } });
  const integrationConnector = {
    ensureConnected: jest.fn().mockResolvedValue(false),
    isConnected: false,
    isConnecting: false,
    connect: jest.fn(),
    labelKey: 'com_integrations_google_drive',
    status: 'not_connected',
  };
  mockUseIntegrationConnectors.mockReturnValue({
    'google-drive': integrationConnector,
    'google-mail': integrationConnector,
    'google-calendar': integrationConnector,
    microsoft: integrationConnector,
    dropbox: integrationConnector,
    box: integrationConnector,
    clio: integrationConnector,
  });
  mockUseAgentToolPermissions.mockReturnValue({
    fileSearchAllowedByAgent: false,
    codeAllowedByAgent: false,
    provider: overrides.provider ?? undefined,
  });
}

function renderMenu(props: Record<string, unknown> = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>
        <AttachFileMenu
          conversationId="test-convo"
          files={new Map()}
          setFiles={() => {}}
          setFilesLoading={() => {}}
          conversation={null}
          {...props}
        />
      </RecoilRoot>
    </QueryClientProvider>,
  );
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: /attach file options/i }));
}

describe('AttachFileMenu', () => {
  beforeEach(jest.clearAllMocks);

  describe('Upload as attachment vs Upload Image', () => {
    it('shows "Upload as attachment" when endpointType is custom (resolved from agent provider)', () => {
      setupMocks({ provider: 'Moonshot' });
      renderMenu({ endpointType: EModelEndpoint.custom });
      openMenu();
      expect(screen.getByText('Upload as attachment')).toBeInTheDocument();
      expect(screen.queryByText('Upload Image')).not.toBeInTheDocument();
    });

    it('shows "Upload as attachment" when endpointType is openAI', () => {
      setupMocks({ provider: EModelEndpoint.openAI });
      renderMenu({ endpointType: EModelEndpoint.openAI });
      openMenu();
      expect(screen.getByText('Upload as attachment')).toBeInTheDocument();
    });

    it('shows "Upload as attachment" when endpointType is anthropic', () => {
      setupMocks({ provider: EModelEndpoint.anthropic });
      renderMenu({ endpointType: EModelEndpoint.anthropic });
      openMenu();
      expect(screen.getByText('Upload as attachment')).toBeInTheDocument();
    });

    it('shows "Upload as attachment" when endpointType is google', () => {
      setupMocks({ provider: Providers.GOOGLE });
      renderMenu({ endpointType: EModelEndpoint.google });
      openMenu();
      expect(screen.getByText('Upload as attachment')).toBeInTheDocument();
    });

    it('shows "Upload Image" when endpointType is agents (no provider resolution)', () => {
      setupMocks();
      renderMenu({ endpointType: EModelEndpoint.agents });
      openMenu();
      expect(screen.getByText('Upload Image')).toBeInTheDocument();
      expect(screen.queryByText('Upload as attachment')).not.toBeInTheDocument();
    });

    it('shows "Upload Image" when neither endpointType nor provider supports documents', () => {
      setupMocks({ provider: 'unknown-provider' });
      renderMenu({ endpointType: 'unknown-type' });
      openMenu();
      expect(screen.getByText('Upload Image')).toBeInTheDocument();
    });

    it('shows "Upload as attachment" for azureOpenAI with useResponsesApi', () => {
      setupMocks({ provider: EModelEndpoint.azureOpenAI });
      renderMenu({ endpointType: EModelEndpoint.azureOpenAI, useResponsesApi: true });
      openMenu();
      expect(screen.getByText('Upload as attachment')).toBeInTheDocument();
    });

    it('shows "Upload as attachment" for azureOpenAI endpointType with useResponsesApi', () => {
      setupMocks();
      renderMenu({
        endpoint: EModelEndpoint.agents,
        endpointType: EModelEndpoint.azureOpenAI,
        useResponsesApi: true,
      });
      openMenu();
      expect(screen.getByText('Upload as attachment')).toBeInTheDocument();
    });

    it('shows "Upload Image" for azureOpenAI without useResponsesApi', () => {
      setupMocks({ provider: EModelEndpoint.azureOpenAI });
      renderMenu({ endpointType: EModelEndpoint.azureOpenAI, useResponsesApi: false });
      openMenu();
      expect(screen.getByText('Upload Image')).toBeInTheDocument();
    });
  });

  describe('agent provider resolution scenario', () => {
    it('shows "Upload as attachment" when agents endpoint has custom endpointType from provider', () => {
      setupMocks({ provider: 'Moonshot' });
      renderMenu({
        endpoint: EModelEndpoint.agents,
        endpointType: EModelEndpoint.custom,
      });
      openMenu();
      expect(screen.getByText('Upload as attachment')).toBeInTheDocument();
    });

    it('shows "Upload Image" when agents endpoint has no resolved provider type', () => {
      setupMocks();
      renderMenu({
        endpoint: EModelEndpoint.agents,
        endpointType: EModelEndpoint.agents,
      });
      openMenu();
      expect(screen.getByText('Upload Image')).toBeInTheDocument();
    });
  });

  describe('Basic Rendering', () => {
    it('renders the attachment button', () => {
      setupMocks();
      renderMenu();
      expect(screen.getByRole('button', { name: /attach file options/i })).toBeInTheDocument();
    });

    it('is disabled when disabled prop is true', () => {
      setupMocks();
      renderMenu({ disabled: true });
      expect(screen.getByRole('button', { name: /attach file options/i })).toBeDisabled();
    });

    it('is not disabled when disabled prop is false', () => {
      setupMocks();
      renderMenu({ disabled: false });
      expect(screen.getByRole('button', { name: /attach file options/i })).not.toBeDisabled();
    });
  });

  describe('Agent Capabilities', () => {
    it('shows OCR Text option when context is enabled', () => {
      setupMocks();
      mockUseAgentCapabilities.mockReturnValue({
        contextEnabled: true,
        fileSearchEnabled: false,
        codeEnabled: false,
      });
      renderMenu({ endpointType: EModelEndpoint.openAI });
      openMenu();
      expect(screen.getByText('Upload as Text')).toBeInTheDocument();
    });

    it('shows File Search option when enabled and allowed by agent', () => {
      setupMocks();
      mockUseAgentCapabilities.mockReturnValue({
        contextEnabled: false,
        fileSearchEnabled: true,
        codeEnabled: false,
      });
      mockUseAgentToolPermissions.mockReturnValue({
        fileSearchAllowedByAgent: true,
        codeAllowedByAgent: false,
        provider: undefined,
      });
      renderMenu({ endpointType: EModelEndpoint.openAI });
      openMenu();
      expect(screen.getByText('Upload for File Search')).toBeInTheDocument();
    });

    it('does NOT show File Search when enabled but not allowed by agent', () => {
      setupMocks();
      mockUseAgentCapabilities.mockReturnValue({
        contextEnabled: false,
        fileSearchEnabled: true,
        codeEnabled: false,
      });
      renderMenu({ endpointType: EModelEndpoint.openAI });
      openMenu();
      expect(screen.queryByText('Upload for File Search')).not.toBeInTheDocument();
    });

    it('shows Code Files option when enabled and allowed by agent', () => {
      setupMocks();
      mockUseAgentCapabilities.mockReturnValue({
        contextEnabled: false,
        fileSearchEnabled: false,
        codeEnabled: true,
      });
      mockUseAgentToolPermissions.mockReturnValue({
        fileSearchAllowedByAgent: false,
        codeAllowedByAgent: true,
        provider: undefined,
      });
      renderMenu({ endpointType: EModelEndpoint.openAI });
      openMenu();
      expect(screen.getByText('Upload to Code Environment')).toBeInTheDocument();
    });

    it('shows all options when all capabilities are enabled', () => {
      setupMocks();
      mockUseAgentCapabilities.mockReturnValue({
        contextEnabled: true,
        fileSearchEnabled: true,
        codeEnabled: true,
      });
      mockUseAgentToolPermissions.mockReturnValue({
        fileSearchAllowedByAgent: true,
        codeAllowedByAgent: true,
        provider: undefined,
      });
      renderMenu({ endpointType: EModelEndpoint.openAI });
      openMenu();
      expect(screen.getByText('Upload as attachment')).toBeInTheDocument();
      expect(screen.getByText('Upload as Text')).toBeInTheDocument();
      expect(screen.getByText('Upload for File Search')).toBeInTheDocument();
      expect(screen.getByText('Upload to Code Environment')).toBeInTheDocument();
    });

    it('passes File Search resource when the file input changes before React state commits', () => {
      setupMocks();
      const handleFileChange = jest.fn();
      mockUseFileHandlingNoChatContext.mockReturnValue({ handleFileChange });
      mockUseAgentCapabilities.mockReturnValue({
        contextEnabled: false,
        fileSearchEnabled: true,
        codeEnabled: false,
      });
      mockUseAgentToolPermissions.mockReturnValue({
        fileSearchAllowedByAgent: true,
        codeAllowedByAgent: false,
        provider: undefined,
      });
      const originalClick = HTMLInputElement.prototype.click;
      const file = new File(['data'], 'sheet.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      HTMLInputElement.prototype.click = function click() {
        Object.defineProperty(this, 'files', {
          configurable: true,
          value: [file],
        });
        fireEvent.change(this);
      };

      try {
        renderMenu({ endpointType: EModelEndpoint.openAI });
        openMenu();
        fireEvent.click(screen.getByText('Upload as attachment'));
        fireEvent.click(screen.getByText('Upload for File Search'));
      } finally {
        HTMLInputElement.prototype.click = originalClick;
      }

      expect(handleFileChange).toHaveBeenNthCalledWith(1, expect.any(Object), undefined);
      expect(handleFileChange).toHaveBeenNthCalledWith(
        2,
        expect.any(Object),
        EToolResources.file_search,
      );
    });
  });

  describe('SharePoint Integration', () => {
    it('shows SharePoint option when enabled', () => {
      setupMocks();
      mockUseGetStartupConfig.mockReturnValue({
        data: { sharePointFilePickerEnabled: true, integrationsEnabled: false },
      });
      renderMenu({ endpointType: EModelEndpoint.openAI });
      openMenu();
      expect(screen.getByText('SharePoint')).toBeInTheDocument();
    });

    it('does NOT show SharePoint option when disabled', () => {
      setupMocks();
      renderMenu({ endpointType: EModelEndpoint.openAI });
      openMenu();
      expect(screen.queryByText('SharePoint')).not.toBeInTheDocument();
    });
  });

  describe('Google Drive Integration', () => {
    it('shows destination submenu when Drive is connected', () => {
      setupMocks();
      mockUseGetStartupConfig.mockReturnValue({
        data: { sharePointFilePickerEnabled: false, integrationsEnabled: true },
      });
      mockUseIntegrationsQuery.mockReturnValue({
        data: {
          integrations: [
            {
              providerKey: 'google-drive',
              enabled: true,
              status: 'connected',
            },
          ],
        },
      });
      mockUseAgentCapabilities.mockReturnValue({
        contextEnabled: true,
        fileSearchEnabled: true,
        codeEnabled: true,
      });
      mockUseAgentToolPermissions.mockReturnValue({
        fileSearchAllowedByAgent: true,
        codeAllowedByAgent: true,
        provider: undefined,
      });
      renderMenu({ endpointType: EModelEndpoint.openAI });
      openMenu();
      expect(screen.getByText('Google')).toBeInTheDocument();
      expect(screen.getByText('Google Drive')).toBeInTheDocument();
      expect(screen.getByTestId('submenu-item-Upload as Text')).toBeInTheDocument();
      expect(screen.getByTestId('submenu-item-Upload to Code Environment')).toBeInTheDocument();
    });

    it('shows flat connect item when Drive is not connected', () => {
      setupMocks();
      mockUseGetStartupConfig.mockReturnValue({
        data: { sharePointFilePickerEnabled: false, integrationsEnabled: true },
      });
      mockUseIntegrationsQuery.mockReturnValue({
        data: {
          integrations: [
            {
              providerKey: 'google-drive',
              enabled: true,
              status: 'not_connected',
            },
          ],
        },
      });
      renderMenu({ endpointType: EModelEndpoint.openAI });
      openMenu();
      expect(screen.getByText('Google Drive')).toBeInTheDocument();
      expect(screen.queryByText('Connect another service…')).not.toBeInTheDocument();
      expect(screen.queryByText('From Google Drive')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles undefined endpoint and provider gracefully', () => {
      setupMocks();
      renderMenu({ endpoint: undefined, endpointType: undefined });
      const button = screen.getByRole('button', { name: /attach file options/i });
      expect(button).toBeInTheDocument();
      fireEvent.click(button);
      expect(screen.getByText('Upload Image')).toBeInTheDocument();
    });

    it('handles null endpoint and provider gracefully', () => {
      setupMocks();
      renderMenu({ endpoint: null, endpointType: null });
      expect(screen.getByRole('button', { name: /attach file options/i })).toBeInTheDocument();
    });

    it('handles missing agentId gracefully', () => {
      setupMocks();
      renderMenu({ agentId: undefined, endpointType: EModelEndpoint.openAI });
      expect(screen.getByRole('button', { name: /attach file options/i })).toBeInTheDocument();
    });

    it('handles empty string agentId', () => {
      setupMocks();
      renderMenu({ agentId: '', endpointType: EModelEndpoint.openAI });
      expect(screen.getByRole('button', { name: /attach file options/i })).toBeInTheDocument();
    });
  });
});
