import React from 'react';
import { render, screen } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { MCPUIResource } from '../MCPUIResource';
import { useOptionalMessagesConversation } from '~/Providers';
import { useConversationUIResources } from '~/hooks/Messages/useConversationUIResources';
import { useLocalize } from '~/hooks';
import type { UIResource } from 'librechat-data-provider';

jest.mock('~/Providers', () => ({
  useOptionalMessagesConversation: jest.fn(),
}));
jest.mock('~/hooks/Messages/useConversationUIResources');
jest.mock('~/hooks', () => ({
  useLocalize: jest.fn(),
}));
jest.mock('~/hooks/MCP', () => ({
  useMCPAppCallbacks: () => ({
    onCallTool: jest.fn(),
    onReadResource: jest.fn(),
    onOpenLink: jest.fn(),
  }),
}));

jest.mock('@mcp-ui/client', () => ({
  AppRenderer: ({ toolName, toolResourceUri }: { toolName: string; toolResourceUri: string }) => (
    <div
      data-testid="ui-resource-renderer"
      data-resource-uri={toolResourceUri}
      data-tool-name={toolName}
    />
  ),
}));

jest.mock('~/utils/mcpApps', () => ({
  getMCPSandboxConfig: () => ({ url: new URL('http://localhost/sandbox') }),
  callMCPAppTool: jest.fn(),
  readMCPResource: jest.fn(),
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
  mimeType: 'text/html',
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
    it('renders AppRenderer for resources with toolName and serverName', () => {
      const resource = makeResource();
      mockUseConversationUIResources.mockReturnValue(new Map([['resource-1', resource]]));

      renderWithRecoil(<MCPUIResource node={{ properties: { resourceId: 'resource-1' } }} />);

      const renderer = screen.getByTestId('ui-resource-renderer');
      expect(renderer).toBeInTheDocument();
      expect(renderer).toHaveAttribute('data-resource-uri', 'ui://test/resource');
      expect(renderer).toHaveAttribute('data-tool-name', 'test-tool');
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
      expect(screen.queryByTestId('ui-resource-renderer')).not.toBeInTheDocument();
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
