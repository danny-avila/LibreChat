import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen } from '@testing-library/react';
import { useConversationUIResources } from '~/hooks/Messages/useConversationUIResources';
import { UI_RESOURCE_MARKER } from '~/components/MCPUIResource/plugin';
import MarkdownLite from '../MarkdownLite';
import Markdown from '../Markdown';

// Mock specific leaf hook rather than barrel exports to avoid circular module evaluation in Jest
jest.mock('~/hooks/Messages/useConversationUIResources', () => ({
  useConversationUIResources: jest.fn(),
}));

jest.mock('~/Providers', () => ({
  ...jest.requireActual('~/Providers'),
  useIsMessagesViewReadOnly: jest.fn(() => false),
}));

jest.mock('~/utils/mcpApps', () => ({
  getInlineResourceHtml: (resource: { text?: string }) => resource?.text,
  isMcpAppResource: (resource: { toolName?: string; serverName?: string; mimeType?: string }) =>
    !!(resource?.toolName && resource?.serverName) &&
    jest.requireActual('librechat-data-provider').isMcpAppMimeType(resource.mimeType),
  buildAppToolResult: jest.fn(),
  getMCPSandboxUrl: () => 'http://localhost/sandbox',
  getResourceKey: (resource: { resourceId?: string; uri?: string }) =>
    resource?.resourceId || resource?.uri || '',
  clampAppViewHeight: (height?: number) => height,
  MAX_CAROUSEL_VIEW_HEIGHT: 720,
  callMCPAppTool: jest.fn(),
  readMCPResource: jest.fn(),
  fetchMCPResourceHtml: jest.fn(),
}));

jest.mock('~/hooks/MCP', () => ({
  useAppBridge: jest.fn(),
  useMCPAppFrame: jest.requireActual('~/hooks/MCP/useMCPAppFrame').useMCPAppFrame,
  useMCPIconMap: () => new Map(),
}));

const mockUseConversationUIResources = useConversationUIResources as jest.MockedFunction<
  typeof useConversationUIResources
>;

describe('Markdown with MCP UI markers (resource IDs)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders two UIResourceRenderer components for markers with resource IDs across separate attachments', () => {
    // Two tool responses, each produced one ui_resources attachment
    const paris = {
      resourceId: 'abc123',
      uri: 'ui://weather/paris',
      mimeType: 'text/html;profile=mcp-app',
      toolName: 'get_weather',
      serverName: 'weather-server',
    };
    const nyc = {
      resourceId: 'def456',
      uri: 'ui://weather/nyc',
      mimeType: 'text/html;profile=mcp-app',
      toolName: 'get_weather',
      serverName: 'weather-server',
    };

    const resourceMap = new Map<string, any>([
      ['abc123', paris],
      ['def456', nyc],
    ]);
    mockUseConversationUIResources.mockReturnValue(resourceMap as any);

    const content = [
      'Here are the current weather conditions for both Paris and New York:',
      '',
      '- Paris: Slight rain, 53°F, humidity 76%, wind 9 mph.',
      '- New York: Clear sky, 63°F, humidity 91%, wind 6 mph.',
      '',
      `Browse these weather cards for more details ${UI_RESOURCE_MARKER}{abc123} ${UI_RESOURCE_MARKER}{def456}`,
    ].join('\n');

    render(
      <RecoilRoot>
        <Markdown content={content} isLatestMessage={false} />
      </RecoilRoot>,
    );

    expect(document.querySelectorAll('iframe[data-sandbox-url]')).toHaveLength(2);
  });
});

describe('Markdown table rendering', () => {
  const tableMarkdown = [
    '| Alpha | Bravo | Charlie | Delta | Echo | Foxtrot | Golf | Hotel |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    '| one | two | three | four | five | six | seven | eight |',
  ].join('\n');

  it('wraps GFM tables in a horizontally scrollable container', () => {
    render(
      <RecoilRoot>
        <Markdown content={tableMarkdown} isLatestMessage={false} />
      </RecoilRoot>,
    );

    expect(screen.getByRole('table').parentElement).toHaveClass(
      'markdown-table-wrapper',
      'w-full',
      'max-w-full',
    );
  });

  it('wraps lightweight Markdown tables in a horizontally scrollable container', () => {
    render(<MarkdownLite content={tableMarkdown} />);

    expect(screen.getByRole('table').parentElement).toHaveClass(
      'markdown-table-wrapper',
      'w-full',
      'max-w-full',
    );
  });
});
