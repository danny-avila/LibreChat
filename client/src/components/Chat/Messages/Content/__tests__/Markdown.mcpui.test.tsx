import React from 'react';
import { render, screen } from '@testing-library/react';
import Markdown from '../Markdown';
import { RecoilRoot } from 'recoil';
import { UI_RESOURCE_MARKER } from '~/components/MCPUIResource/plugin';
import { useMessageContext, useChatContext } from '~/Providers';
import { useGetMessagesByConvoId } from '~/data-provider';
import { useLocalize } from '~/hooks';
import useSubmitMessage from '~/hooks/Messages/useSubmitMessage';

// Mocks for hooks used by MCPUIResource when rendered inside Markdown.
// Keep Provider components intact while mocking only the hooks we use.
jest.mock('~/Providers', () => ({
  ...jest.requireActual('~/Providers'),
  useMessageContext: jest.fn(),
  useChatContext: jest.fn(),
}));
jest.mock('~/data-provider');
jest.mock('~/hooks');
jest.mock('~/hooks/Messages/useSubmitMessage');

// Mock @mcp-ui/client to render identifiable elements for assertions
jest.mock('@mcp-ui/client', () => ({
  UIResourceRenderer: ({ resource }: any) => (
    <div data-testid="ui-resource-renderer" data-resource-uri={resource?.uri} />
  ),
}));

const mockUseMessageContext = useMessageContext as jest.MockedFunction<typeof useMessageContext>;
const mockUseChatContext = useChatContext as jest.MockedFunction<typeof useChatContext>;
const mockUseGetMessagesByConvoId = useGetMessagesByConvoId as jest.MockedFunction<
  typeof useGetMessagesByConvoId
>;
const mockUseLocalize = useLocalize as jest.MockedFunction<typeof useLocalize>;
const mockUseSubmitMessage = useSubmitMessage as jest.MockedFunction<typeof useSubmitMessage>;

describe('Markdown with MCP UI markers (two attachments ui0 ui1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseMessageContext.mockReturnValue({ messageId: 'msg-weather' } as any);
    mockUseChatContext.mockReturnValue({ conversation: { conversationId: 'conv1' } } as any);
    mockUseLocalize.mockReturnValue(((key: string) => key) as any);
    mockUseSubmitMessage.mockReturnValue({ submitMessage: jest.fn() } as any);
  });

  it('renders two UIResourceRenderer components for markers ui0 and ui1 across separate attachments', () => {
    // Two tool responses, each produced one ui_resources attachment
    const paris = {
      uri: 'ui://weather/paris',
      mimeType: 'text/html',
      text: '<div>Paris Weather</div>',
    };
    const nyc = {
      uri: 'ui://weather/nyc',
      mimeType: 'text/html',
      text: '<div>NYC Weather</div>',
    };

    const messages = [
      {
        messageId: 'msg-weather',
        attachments: [
          { type: 'ui_resources', ui_resources: [paris] },
          { type: 'ui_resources', ui_resources: [nyc] },
        ],
      },
    ];

    mockUseGetMessagesByConvoId.mockReturnValue({ data: messages } as any);

    const content = [
      'Here are the current weather conditions for both Paris and New York:',
      '',
      '- Paris: Slight rain, 53°F, humidity 76%, wind 9 mph.',
      '- New York: Clear sky, 63°F, humidity 91%, wind 6 mph.',
      '',
      `Browse these weather cards for more details ${UI_RESOURCE_MARKER}0 ${UI_RESOURCE_MARKER}1`,
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
