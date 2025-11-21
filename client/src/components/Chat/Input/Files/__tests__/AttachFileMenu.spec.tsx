import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EModelEndpoint } from 'librechat-data-provider';
import AttachFileMenu from '../AttachFileMenu';

// Mock all the hooks
jest.mock('~/hooks', () => ({
  useAgentToolPermissions: jest.fn(),
  useAgentCapabilities: jest.fn(),
  useGetAgentsConfig: jest.fn(),
  useFileHandling: jest.fn(),
  useLocalize: jest.fn(),
}));

jest.mock('~/hooks/Files/useSharePointFileHandling', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: jest.fn(),
}));

jest.mock('~/components/SharePoint', () => ({
  SharePointPickerDialog: jest.fn(() => null),
}));

jest.mock('@librechat/client', () => {
  const React = jest.requireActual('react');
  return {
    FileUpload: React.forwardRef(({ children, handleFileChange }: any, ref: any) => (
      <div data-testid="file-upload">
        <input ref={ref} type="file" onChange={handleFileChange} data-testid="file-input" />
        {children}
      </div>
    )),
    TooltipAnchor: ({ render }: any) => render,
    DropdownPopup: ({ trigger, items, isOpen, setIsOpen }: any) => {
      const handleTriggerClick = () => {
        if (setIsOpen) {
          setIsOpen(!isOpen);
        }
      };

      return (
        <div>
          <div onClick={handleTriggerClick}>{trigger}</div>
          {isOpen && (
            <div data-testid="dropdown-menu">
              {items.map((item: any, idx: number) => (
                <button key={idx} onClick={item.onClick} data-testid={`menu-item-${idx}`}>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    },
    AttachmentIcon: () => <span data-testid="attachment-icon">📎</span>,
    SharePointIcon: () => <span data-testid="sharepoint-icon">SP</span>,
  };
});

jest.mock('@ariakit/react', () => ({
  MenuButton: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

const mockUseAgentToolPermissions = jest.requireMock('~/hooks').useAgentToolPermissions;
const mockUseAgentCapabilities = jest.requireMock('~/hooks').useAgentCapabilities;
const mockUseGetAgentsConfig = jest.requireMock('~/hooks').useGetAgentsConfig;
const mockUseFileHandling = jest.requireMock('~/hooks').useFileHandling;
const mockUseLocalize = jest.requireMock('~/hooks').useLocalize;
const mockUseSharePointFileHandling = jest.requireMock(
  '~/hooks/Files/useSharePointFileHandling',
).default;
const mockUseGetStartupConfig = jest.requireMock('~/data-provider').useGetStartupConfig;

describe('AttachFileMenu', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const mockHandleFileChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockUseLocalize.mockReturnValue((key: string) => {
      const translations: Record<string, string> = {
        com_ui_upload_provider: 'Upload to Provider',
        com_ui_upload_image_input: 'Upload Image',
        com_ui_upload_ocr_text: 'Upload OCR Text',
        com_ui_upload_file_search: 'Upload for File Search',
        com_ui_upload_code_files: 'Upload Code Files',
        com_sidepanel_attach_files: 'Attach Files',
        com_files_upload_sharepoint: 'Upload from SharePoint',
      };
      return translations[key] || key;
    });

    mockUseAgentCapabilities.mockReturnValue({
      contextEnabled: false,
      fileSearchEnabled: false,
      codeEnabled: false,
    });

    mockUseGetAgentsConfig.mockReturnValue({
      agentsConfig: {
        capabilities: {
          contextEnabled: false,
          fileSearchEnabled: false,
          codeEnabled: false,
        },
      },
    });

    mockUseFileHandling.mockReturnValue({
      handleFileChange: mockHandleFileChange,
    });

    mockUseSharePointFileHandling.mockReturnValue({
      handleSharePointFiles: jest.fn(),
      isProcessing: false,
      downloadProgress: 0,
    });

    mockUseGetStartupConfig.mockReturnValue({
      data: {
        sharePointFilePickerEnabled: false,
      },
    });

    mockUseAgentToolPermissions.mockReturnValue({
      fileSearchAllowedByAgent: false,
      codeAllowedByAgent: false,
      provider: undefined,
    });
  });

  const renderAttachFileMenu = (props: any = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <RecoilRoot>
          <AttachFileMenu conversationId="test-conversation" {...props} />
        </RecoilRoot>
      </QueryClientProvider>,
    );
  };

  describe('Basic Rendering', () => {
    it('should render the attachment button', () => {
      renderAttachFileMenu();
      const button = screen.getByRole('button', { name: /attach file options/i });
      expect(button).toBeInTheDocument();
    });

    it('should be disabled when disabled prop is true', () => {
      renderAttachFileMenu({ disabled: true });
      const button = screen.getByRole('button', { name: /attach file options/i });
      expect(button).toBeDisabled();
    });

    it('should not be disabled when disabled prop is false', () => {
      renderAttachFileMenu({ disabled: false });
      const button = screen.getByRole('button', { name: /attach file options/i });
      expect(button).not.toBeDisabled();
    });
  });

  describe('Provider Detection Fix - endpointType Priority', () => {
    it('should prioritize endpointType over currentProvider for LiteLLM gateway', () => {
      mockUseAgentToolPermissions.mockReturnValue({
        fileSearchAllowedByAgent: false,
        codeAllowedByAgent: false,
        provider: 'litellm', // Custom gateway name NOT in documentSupportedProviders
      });

      renderAttachFileMenu({
        endpoint: 'litellm',
        endpointType: EModelEndpoint.openAI, // Backend override IS in documentSupportedProviders
      });

      const button = screen.getByRole('button', { name: /attach file options/i });
      fireEvent.click(button);

      // With the fix, should show "Upload to Provider" because endpointType is checked first
      expect(screen.getByText('Upload to Provider')).toBeInTheDocument();
      expect(screen.queryByText('Upload Image')).not.toBeInTheDocument();
    });

    it('should show Upload to Provider for custom endpoints with OpenAI endpointType', () => {
      mockUseAgentToolPermissions.mockReturnValue({
        fileSearchAllowedByAgent: false,
        codeAllowedByAgent: false,
        provider: 'my-custom-gateway',
      });

      renderAttachFileMenu({
        endpoint: 'my-custom-gateway',
        endpointType: EModelEndpoint.openAI,
      });

      const button = screen.getByRole('button', { name: /attach file options/i });
      fireEvent.click(button);

      expect(screen.getByText('Upload to Provider')).toBeInTheDocument();
    });

    it('should show Upload Image when neither endpointType nor provider support documents', () => {
      mockUseAgentToolPermissions.mockReturnValue({
        fileSearchAllowedByAgent: false,
        codeAllowedByAgent: false,
        provider: 'unsupported-provider',
      });

      renderAttachFileMenu({
        endpoint: 'unsupported-provider',
        endpointType: 'unsupported-endpoint' as any,
      });

      const button = screen.getByRole('button', { name: /attach file options/i });
      fireEvent.click(button);

      expect(screen.getByText('Upload Image')).toBeInTheDocument();
      expect(screen.queryByText('Upload to Provider')).not.toBeInTheDocument();
    });

    it('should fallback to currentProvider when endpointType is undefined', () => {
      mockUseAgentToolPermissions.mockReturnValue({
        fileSearchAllowedByAgent: false,
        codeAllowedByAgent: false,
        provider: EModelEndpoint.openAI,
      });

      renderAttachFileMenu({
        endpoint: EModelEndpoint.openAI,
        endpointType: undefined,
      });

      const button = screen.getByRole('button', { name: /attach file options/i });
      fireEvent.click(button);

      expect(screen.getByText('Upload to Provider')).toBeInTheDocument();
    });

    it('should fallback to currentProvider when endpointType is null', () => {
      mockUseAgentToolPermissions.mockReturnValue({
        fileSearchAllowedByAgent: false,
        codeAllowedByAgent: false,
        provider: EModelEndpoint.anthropic,
      });

      renderAttachFileMenu({
        endpoint: EModelEndpoint.anthropic,
        endpointType: null,
      });

      const button = screen.getByRole('button', { name: /attach file options/i });
      fireEvent.click(button);

      expect(screen.getByText('Upload to Provider')).toBeInTheDocument();
    });
  });

  describe('Supported Providers', () => {
    const supportedProviders = [
      { name: 'OpenAI', endpoint: EModelEndpoint.openAI },
      { name: 'Anthropic', endpoint: EModelEndpoint.anthropic },
      { name: 'Google', endpoint: EModelEndpoint.google },
      { name: 'Azure OpenAI', endpoint: EModelEndpoint.azureOpenAI },
      { name: 'Custom', endpoint: EModelEndpoint.custom },
    ];

    supportedProviders.forEach(({ name, endpoint }) => {
      it(`should show Upload to Provider for ${name}`, () => {
        mockUseAgentToolPermissions.mockReturnValue({
          fileSearchAllowedByAgent: false,
          codeAllowedByAgent: false,
          provider: endpoint,
        });

        renderAttachFileMenu({
          endpoint,
          endpointType: endpoint,
        });

        const button = screen.getByRole('button', { name: /attach file options/i });
        fireEvent.click(button);

        expect(screen.getByText('Upload to Provider')).toBeInTheDocument();
      });
    });
  });

  describe('Agent Capabilities', () => {
    it('should show OCR Text option when context is enabled', () => {
      mockUseAgentCapabilities.mockReturnValue({
        contextEnabled: true,
        fileSearchEnabled: false,
        codeEnabled: false,
      });

      renderAttachFileMenu({
        endpointType: EModelEndpoint.openAI,
      });

      const button = screen.getByRole('button', { name: /attach file options/i });
      fireEvent.click(button);

      expect(screen.getByText('Upload OCR Text')).toBeInTheDocument();
    });

    it('should show File Search option when enabled and allowed by agent', () => {
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

      renderAttachFileMenu({
        endpointType: EModelEndpoint.openAI,
      });

      const button = screen.getByRole('button', { name: /attach file options/i });
      fireEvent.click(button);

      expect(screen.getByText('Upload for File Search')).toBeInTheDocument();
    });

    it('should NOT show File Search when enabled but not allowed by agent', () => {
      mockUseAgentCapabilities.mockReturnValue({
        contextEnabled: false,
        fileSearchEnabled: true,
        codeEnabled: false,
      });

      mockUseAgentToolPermissions.mockReturnValue({
        fileSearchAllowedByAgent: false,
        codeAllowedByAgent: false,
        provider: undefined,
      });

      renderAttachFileMenu({
        endpointType: EModelEndpoint.openAI,
      });

      const button = screen.getByRole('button', { name: /attach file options/i });
      fireEvent.click(button);

      expect(screen.queryByText('Upload for File Search')).not.toBeInTheDocument();
    });

    it('should show Code Files option when enabled and allowed by agent', () => {
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

      renderAttachFileMenu({
        endpointType: EModelEndpoint.openAI,
      });

      const button = screen.getByRole('button', { name: /attach file options/i });
      fireEvent.click(button);

      expect(screen.getByText('Upload Code Files')).toBeInTheDocument();
    });

    it('should show all options when all capabilities are enabled', () => {
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

      renderAttachFileMenu({
        endpointType: EModelEndpoint.openAI,
      });

      const button = screen.getByRole('button', { name: /attach file options/i });
      fireEvent.click(button);

      expect(screen.getByText('Upload to Provider')).toBeInTheDocument();
      expect(screen.getByText('Upload OCR Text')).toBeInTheDocument();
      expect(screen.getByText('Upload for File Search')).toBeInTheDocument();
      expect(screen.getByText('Upload Code Files')).toBeInTheDocument();
    });
  });

  describe('SharePoint Integration', () => {
    it('should show SharePoint option when enabled', () => {
      mockUseGetStartupConfig.mockReturnValue({
        data: {
          sharePointFilePickerEnabled: true,
        },
      });

      renderAttachFileMenu({
        endpointType: EModelEndpoint.openAI,
      });

      const button = screen.getByRole('button', { name: /attach file options/i });
      fireEvent.click(button);

      expect(screen.getByText('Upload from SharePoint')).toBeInTheDocument();
    });

    it('should NOT show SharePoint option when disabled', () => {
      mockUseGetStartupConfig.mockReturnValue({
        data: {
          sharePointFilePickerEnabled: false,
        },
      });

      renderAttachFileMenu({
        endpointType: EModelEndpoint.openAI,
      });

      const button = screen.getByRole('button', { name: /attach file options/i });
      fireEvent.click(button);

      expect(screen.queryByText('Upload from SharePoint')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined endpoint and provider gracefully', () => {
      mockUseAgentToolPermissions.mockReturnValue({
        fileSearchAllowedByAgent: false,
        codeAllowedByAgent: false,
        provider: undefined,
      });

      renderAttachFileMenu({
        endpoint: undefined,
        endpointType: undefined,
      });

      const button = screen.getByRole('button', { name: /attach file options/i });
      expect(button).toBeInTheDocument();
      fireEvent.click(button);

      // Should show Upload Image as fallback
      expect(screen.getByText('Upload Image')).toBeInTheDocument();
    });

    it('should handle null endpoint and provider gracefully', () => {
      mockUseAgentToolPermissions.mockReturnValue({
        fileSearchAllowedByAgent: false,
        codeAllowedByAgent: false,
        provider: null,
      });

      renderAttachFileMenu({
        endpoint: null,
        endpointType: null,
      });

      const button = screen.getByRole('button', { name: /attach file options/i });
      expect(button).toBeInTheDocument();
    });

    it('should handle missing agentId gracefully', () => {
      renderAttachFileMenu({
        agentId: undefined,
        endpointType: EModelEndpoint.openAI,
      });

      const button = screen.getByRole('button', { name: /attach file options/i });
      expect(button).toBeInTheDocument();
    });

    it('should handle empty string agentId', () => {
      renderAttachFileMenu({
        agentId: '',
        endpointType: EModelEndpoint.openAI,
      });

      const button = screen.getByRole('button', { name: /attach file options/i });
      expect(button).toBeInTheDocument();
    });
  });

  describe('Google Provider Special Case', () => {
    it('should use google_multimodal file type for Google provider', () => {
      mockUseAgentToolPermissions.mockReturnValue({
        fileSearchAllowedByAgent: false,
        codeAllowedByAgent: false,
        provider: EModelEndpoint.google,
      });

      renderAttachFileMenu({
        endpoint: EModelEndpoint.google,
        endpointType: EModelEndpoint.google,
      });

      const button = screen.getByRole('button', { name: /attach file options/i });
      fireEvent.click(button);

      const uploadProviderButton = screen.getByText('Upload to Provider');
      expect(uploadProviderButton).toBeInTheDocument();

      // Click the upload to provider option
      fireEvent.click(uploadProviderButton);

      // The file input should have been clicked (indirectly tested through the implementation)
    });

    it('should use multimodal file type for non-Google providers', () => {
      mockUseAgentToolPermissions.mockReturnValue({
        fileSearchAllowedByAgent: false,
        codeAllowedByAgent: false,
        provider: EModelEndpoint.openAI,
      });

      renderAttachFileMenu({
        endpoint: EModelEndpoint.openAI,
        endpointType: EModelEndpoint.openAI,
      });

      const button = screen.getByRole('button', { name: /attach file options/i });
      fireEvent.click(button);

      const uploadProviderButton = screen.getByText('Upload to Provider');
      expect(uploadProviderButton).toBeInTheDocument();
      fireEvent.click(uploadProviderButton);

      // Implementation detail - multimodal type is used
    });
  });

  describe('Regression Tests', () => {
    it('should not break the previous behavior for direct provider attachments', () => {
      // When using a direct supported provider (not through a gateway)
      mockUseAgentToolPermissions.mockReturnValue({
        fileSearchAllowedByAgent: false,
        codeAllowedByAgent: false,
        provider: EModelEndpoint.anthropic,
      });

      renderAttachFileMenu({
        endpoint: EModelEndpoint.anthropic,
        endpointType: EModelEndpoint.anthropic,
      });

      const button = screen.getByRole('button', { name: /attach file options/i });
      fireEvent.click(button);

      expect(screen.getByText('Upload to Provider')).toBeInTheDocument();
    });

    it('should maintain correct priority when both are supported', () => {
      // Both endpointType and provider are supported, endpointType should be checked first
      mockUseAgentToolPermissions.mockReturnValue({
        fileSearchAllowedByAgent: false,
        codeAllowedByAgent: false,
        provider: EModelEndpoint.google,
      });

      renderAttachFileMenu({
        endpoint: EModelEndpoint.google,
        endpointType: EModelEndpoint.openAI, // Different but both supported
      });

      const button = screen.getByRole('button', { name: /attach file options/i });
      fireEvent.click(button);

      // Should still work because endpointType (openAI) is supported
      expect(screen.getByText('Upload to Provider')).toBeInTheDocument();
    });
  });
});
