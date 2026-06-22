import React from 'react';
import { render, screen } from '@testing-library/react';
import Markdown from '../Markdown';
import MarkdownLite from '../MarkdownLite';
import { RecoilRoot } from 'recoil';
import { UI_RESOURCE_MARKER } from '~/components/MCPUIResource/plugin';
import {
  useMessageContext,
  useOptionalMessagesConversation,
  useOptionalMessagesOperations,
} from '~/Providers';
import { useConversationUIResources } from '~/hooks/Messages/useConversationUIResources';
import { useGetMessagesByConvoId } from '~/data-provider';
import { useLocalize } from '~/hooks';

jest.mock('~/Providers', () => ({
  ...jest.requireActual('~/Providers'),
  useMessageContext: jest.fn(),
  useOptionalMessagesConversation: jest.fn(),
  useOptionalMessagesOperations: jest.fn(),
}));
jest.mock('~/data-provider');
jest.mock('~/hooks');
jest.mock('~/hooks/Messages/useConversationUIResources');

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

jest.mock('~/hooks/MCP', () => ({
  useMCPAppCallbacks: () => ({
    onCallTool: jest.fn(),
    onReadResource: jest.fn(),
    onOpenLink: jest.fn(),
  }),
  useMCPIconMap: () => new Map(),
}));

const mockUseMessageContext = useMessageContext as jest.MockedFunction<typeof useMessageContext>;
const mockUseMessagesConversation = useOptionalMessagesConversation as jest.MockedFunction<
  typeof useOptionalMessagesConversation
>;
const mockUseMessagesOperations = useOptionalMessagesOperations as jest.MockedFunction<
  typeof useOptionalMessagesOperations
>;
const mockUseConversationUIResources = useConversationUIResources as jest.MockedFunction<
  typeof useConversationUIResources
>;
const mockUseGetMessagesByConvoId = useGetMessagesByConvoId as jest.MockedFunction<
  typeof useGetMessagesByConvoId
>;
const mockUseLocalize = useLocalize as jest.MockedFunction<typeof useLocalize>;

describe('Markdown with MCP UI markers (resource IDs)', () => {
  let currentTestMessages: Record<string, unknown>[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    currentTestMessages = [];
    mockUseConversationUIResources.mockReturnValue(new Map());

    mockUseMessageContext.mockReturnValue({ messageId: 'msg-weather' } as ReturnType<
      typeof useMessageContext
    >);
    mockUseMessagesConversation.mockReturnValue({
      conversation: { conversationId: 'conv1' },
      conversationId: 'conv1',
    } as ReturnType<typeof useOptionalMessagesConversation>);
    mockUseMessagesOperations.mockReturnValue({
      ask: jest.fn(),
      getMessages: () => currentTestMessages,
    } as unknown as ReturnType<typeof useOptionalMessagesOperations>);
    mockUseLocalize.mockReturnValue(((key: string) => key) as ReturnType<typeof useLocalize>);
  });

  it('renders two UIResourceRenderer components for markers with resource IDs across separate attachments', () => {
    const paris = {
      resourceId: 'abc123',
      uri: 'ui://weather/paris',
      mimeType: 'text/html',
      toolName: 'get_weather',
      serverName: 'weather-server',
    };
    const nyc = {
      resourceId: 'def456',
      uri: 'ui://weather/nyc',
      mimeType: 'text/html',
      toolName: 'get_weather',
      serverName: 'weather-server',
    };

    currentTestMessages = [
      {
        messageId: 'msg-weather',
        attachments: [
          { type: 'ui_resources', ui_resources: [paris] },
          { type: 'ui_resources', ui_resources: [nyc] },
        ],
      },
    ];

    mockUseGetMessagesByConvoId.mockReturnValue({ data: currentTestMessages } as ReturnType<
      typeof useGetMessagesByConvoId
    >);
    mockUseConversationUIResources.mockReturnValue(
      new Map([
        ['abc123', paris],
        ['def456', nyc],
      ]),
    );

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

    const renderers = screen.getAllByTestId('ui-resource-renderer');
    expect(renderers).toHaveLength(2);
    expect(renderers[0]).toHaveAttribute('data-resource-uri', 'ui://weather/paris');
    expect(renderers[1]).toHaveAttribute('data-resource-uri', 'ui://weather/nyc');
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
