import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen } from '@testing-library/react';
import type { UIResource } from 'librechat-data-provider';
import { useConversationUIResources } from '~/hooks/Messages/useConversationUIResources';
import { useOptionalMessagesConversation } from '~/Providers';
import { MCPUIResource } from '../MCPUIResource';
import { useLocalize } from '~/hooks';

jest.mock('~/Providers', () => ({
  useOptionalMessagesConversation: jest.fn(),
  useIsMessagesViewReadOnly: jest.fn(() => false),
}));
jest.mock('~/hooks/Messages/useConversationUIResources');
jest.mock('~/hooks', () => ({
  useLocalize: jest.fn(),
}));
jest.mock('~/hooks/MCP', () => ({
  useAppBridge: jest.fn(),
}));

jest.mock('~/utils/mcpApps', () => ({
  isMcpAppResource: (r) =>
    !!(r && r.toolName && r.serverName) && (r.mimeType ?? '').includes('profile=mcp-app'),
  buildAppToolResult: jest.fn(),
  getMCPSandboxUrl: () => 'http://localhost/sandbox',
  callMCPAppTool: jest.fn(),
  readMCPResource: jest.fn(),
  fetchMCPResourceHtml: jest.fn(),
}));

jest.mock('~/utils', () => ({
  logger: { error: jest.fn() },
}));

const mockUseMessagesConversation = useOptionalMessagesConversation as jest.MockedFunction<
  typeof useOptionalMessagesConversation
>;
const mockUseConversationUIResources = useConversationUIResources as jest.MockedFunction<
  typeof useConversationUIResources
>;
const mockUseLocalize = useLocalize as jest.MockedFunction<typeof useLocalize>;

const makeResource = (overrides: Partial<UIResource> = {}): UIResource => ({
  resourceId: 'resource-1',
  uri: 'ui://test/resource',
  mimeType: 'text/html;profile=mcp-app',
  toolName: 'test-tool',
  serverName: 'test-server',
  ...overrides,
});

describe('MCPUIResource', () => {
  const mockLocalize = (key: string, values?: Record<string, string>) => {
    const translations: Record<string, string> = {
      com_ui_ui_resource_not_found: `UI resource ${values?.[0]} not found`,
      com_ui_ui_resource_error: `Error rendering UI resource: ${values?.[0]}`,
    };
    return translations[key] || key;
  };

  const renderWithRecoil = (ui: React.ReactNode) => render(<RecoilRoot>{ui}</RecoilRoot>);

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMessagesConversation.mockReturnValue({
      conversation: { conversationId: 'conv123' },
      conversationId: 'conv123',
    } as ReturnType<typeof useOptionalMessagesConversation>);
    mockUseConversationUIResources.mockReturnValue(new Map());
    mockUseLocalize.mockReturnValue(mockLocalize as unknown as ReturnType<typeof useLocalize>);
  });

  describe('rendering', () => {
    it('renders bridge iframe for resources with toolName and serverName', () => {
      const resource = makeResource();
      mockUseConversationUIResources.mockReturnValue(new Map([['resource-1', resource]]));

      renderWithRecoil(<MCPUIResource node={{ properties: { resourceId: 'resource-1' } }} />);

      const iframe = document.querySelector('iframe[data-sandbox-url]');
      expect(iframe).toBeInTheDocument();
      expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-forms');
      expect(iframe?.getAttribute('title')).toBe('MCP App: test-tool');
    });

    it('renders inline iframe for resources with html text and no server binding', () => {
      const resource = makeResource({
        toolName: undefined,
        serverName: undefined,
        text: '<p>Hello</p>',
      });
      mockUseConversationUIResources.mockReturnValue(new Map([['resource-1', resource]]));

      renderWithRecoil(<MCPUIResource node={{ properties: { resourceId: 'resource-1' } }} />);

      const iframe = document.querySelector('iframe');
      expect(iframe).toBeInTheDocument();
      expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-forms');
      expect(iframe?.getAttribute('sandbox')).not.toContain('allow-same-origin');
    });

    it('renders nothing for resources that are not renderable', () => {
      const resource = makeResource({
        toolName: undefined,
        serverName: undefined,
        mimeType: 'application/json',
      });
      mockUseConversationUIResources.mockReturnValue(new Map([['resource-1', resource]]));

      const { container } = renderWithRecoil(
        <MCPUIResource node={{ properties: { resourceId: 'resource-1' } }} />,
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('not-found handling', () => {
    it('shows not-found badge when resourceId is missing from the map', () => {
      mockUseConversationUIResources.mockReturnValue(new Map());

      renderWithRecoil(<MCPUIResource node={{ properties: { resourceId: 'nonexistent-id' } }} />);

      expect(screen.getByText('UI resource nonexistent-id not found')).toBeInTheDocument();
      expect(screen.queryByRole('iframe')).not.toBeInTheDocument();
    });

    it('shows not-found badge when conversationId is absent', () => {
      mockUseMessagesConversation.mockReturnValue({
        conversation: null,
        conversationId: null,
      } as ReturnType<typeof useOptionalMessagesConversation>);
      mockUseConversationUIResources.mockReturnValue(new Map());

      renderWithRecoil(<MCPUIResource node={{ properties: { resourceId: 'resource-1' } }} />);

      expect(screen.getByText('UI resource resource-1 not found')).toBeInTheDocument();
    });
  });
});
