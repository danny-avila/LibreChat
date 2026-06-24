import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen } from '@testing-library/react';
import {
  useMessageContext,
  useOptionalMessagesConversation,
  useOptionalMessagesOperations,
} from '~/Providers';
import { useConversationUIResources } from '~/hooks/Messages/useConversationUIResources';
import { UI_RESOURCE_MARKER } from '~/components/MCPUIResource/plugin';
import { useGetMessagesByConvoId } from '~/data-provider';
import MarkdownLite from '../MarkdownLite';
import { useLocalize } from '~/hooks';
import Markdown from '../Markdown';

jest.mock('~/Providers', () => ({
  ...jest.requireActual('~/Providers'),
  useMessageContext: jest.fn(),
  useOptionalMessagesConversation: jest.fn(),
  useOptionalMessagesOperations: jest.fn(),
}));
jest.mock('~/data-provider');
jest.mock('~/hooks');
jest.mock('~/hooks/Messages/useConversationUIResources');

jest.mock('~/utils/mcpApps', () => ({
  buildAppToolResult: jest.fn(),
  getMCPSandboxUrl: () => 'http://localhost/sandbox',
  callMCPAppTool: jest.fn(),
  readMCPResource: jest.fn(),
  fetchMCPResourceHtml: jest.fn(),
}));

jest.mock('~/hooks/MCP', () => ({
  useAppBridge: jest.fn(),
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

    const iframes = document.querySelectorAll('iframe[data-sandbox-url]');
    expect(iframes).toHaveLength(2);
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
