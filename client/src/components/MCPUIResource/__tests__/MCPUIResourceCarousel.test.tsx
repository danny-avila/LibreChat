import React from 'react';
import { render, screen } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { MCPUIResourceCarousel } from '../MCPUIResourceCarousel';
import { useMessageContext, useMessagesConversation, useMessagesOperations } from '~/Providers';

// Mock dependencies
jest.mock('~/Providers');

jest.mock('../../Chat/Messages/Content/UIResourceCarousel', () => ({
  __esModule: true,
  default: ({ uiResources }: any) => (
    <div data-testid="ui-resource-carousel" data-resource-count={uiResources.length}>
      {uiResources.map((resource: any, index: number) => (
        <div key={index} data-testid={`resource-${index}`} data-resource-uri={resource.uri} />
      ))}
    </div>
  ),
}));

const mockUseMessageContext = useMessageContext as jest.MockedFunction<typeof useMessageContext>;
const mockUseMessagesConversation = useMessagesConversation as jest.MockedFunction<
  typeof useMessagesConversation
>;
const mockUseMessagesOperations = useMessagesOperations as jest.MockedFunction<
  typeof useMessagesOperations
>;

describe('MCPUIResourceCarousel', () => {
  // Store the current test's messages so getMessages can return them
  let currentTestMessages: any[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    currentTestMessages = [];
    mockUseMessageContext.mockReturnValue({ messageId: 'msg123' } as any);
    mockUseMessagesConversation.mockReturnValue({
      conversation: { conversationId: 'conv123' },
      conversationId: 'conv123',
    } as any);
    mockUseMessagesOperations.mockReturnValue({
      getMessages: () => currentTestMessages,
      ask: jest.fn(),
      regenerate: jest.fn(),
      handleContinue: jest.fn(),
      setMessages: jest.fn(),
    } as any);
  });

  const renderWithRecoil = (ui: React.ReactNode) => render(<RecoilRoot>{ui}</RecoilRoot>);

  describe('multiple resource fetching', () => {
    it('should fetch resources by resourceIds across conversation messages', () => {
      mockUseMessageContext.mockReturnValue({ messageId: 'msg-current' } as any);
      currentTestMessages = [
        {
          messageId: 'msg-origin',
          attachments: [
            {
              type: 'ui_resources',
              ui_resources: [
                {
                  resourceId: 'id-1',
                  uri: 'ui://test/resource-id1',
                  mimeType: 'text/html',
                  text: '<p>Resource via ID 1</p>',
                },
                {
                  resourceId: 'id-2',
                  uri: 'ui://test/resource-id2',
                  mimeType: 'text/html',
                  text: '<p>Resource via ID 2</p>',
                },
              ],
            },
          ],
        },
        {
          messageId: 'msg-current',
          attachments: [],
        },
      ];

      renderWithRecoil(
        <MCPUIResourceCarousel node={{ properties: { resourceIds: ['id-2', 'id-1'] } }} />,
      );

      const carousel = screen.getByTestId('ui-resource-carousel');
      expect(carousel).toHaveAttribute('data-resource-count', '2');

      expect(screen.getByTestId('resource-0')).toHaveAttribute(
        'data-resource-uri',
        'ui://test/resource-id2',
      );
      expect(screen.getByTestId('resource-1')).toHaveAttribute(
        'data-resource-uri',
        'ui://test/resource-id1',
      );
    });
  });

  describe('error handling', () => {
    it('should return null when no attachments', () => {
      currentTestMessages = [
        {
          messageId: 'msg123',
          attachments: undefined,
        },
      ];

      const { container } = renderWithRecoil(
        <MCPUIResourceCarousel node={{ properties: { resourceIds: ['id1', 'id2'] } }} />,
      );

      expect(container.firstChild).toBeNull();
      expect(screen.queryByTestId('ui-resource-carousel')).not.toBeInTheDocument();
    });

    it('should return null when resources not found', () => {
      currentTestMessages = [
        {
          messageId: 'msg123',
          attachments: [
            {
              type: 'ui_resources',
              ui_resources: [
                {
                  resourceId: 'existing-id',
                  uri: 'ui://test/resource',
                  mimeType: 'text/html',
                  text: '<p>Resource content</p>',
                },
              ],
            },
          ],
        },
      ];

      const { container } = renderWithRecoil(
        <MCPUIResourceCarousel node={{ properties: { resourceIds: ['non-existent-id'] } }} />,
      );

      expect(container.firstChild).toBeNull();
    });

    it('should return null when no ui_resources attachments', () => {
      currentTestMessages = [
        {
          messageId: 'msg123',
          attachments: [
            {
              type: 'web_search',
              web_search: { results: [] },
            },
          ],
        },
      ];

      const { container } = renderWithRecoil(
        <MCPUIResourceCarousel node={{ properties: { resourceIds: ['id1', 'id2'] } }} />,
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle empty resourceIds array', () => {
      currentTestMessages = [
        {
          messageId: 'msg123',
          attachments: [
            {
              type: 'ui_resources',
              ui_resources: [
                {
                  resourceId: 'test-id',
                  uri: 'ui://test/resource',
                  mimeType: 'text/html',
                  text: '<p>Resource content</p>',
                },
              ],
            },
          ],
        },
      ];

      const { container } = renderWithRecoil(
        <MCPUIResourceCarousel node={{ properties: { resourceIds: [] } }} />,
      );

      expect(container.firstChild).toBeNull();
    });

    it('should handle duplicate resource IDs', () => {
      currentTestMessages = [
        {
          messageId: 'msg123',
          attachments: [
            {
              type: 'ui_resources',
              ui_resources: [
                {
                  resourceId: 'id-a',
                  uri: 'ui://test/resource-a',
                  mimeType: 'text/html',
                  text: '<p>Resource A content</p>',
                },
                {
                  resourceId: 'id-b',
                  uri: 'ui://test/resource-b',
                  mimeType: 'text/html',
                  text: '<p>Resource B content</p>',
                },
              ],
            },
          ],
        },
      ];

      renderWithRecoil(
        <MCPUIResourceCarousel
          node={{ properties: { resourceIds: ['id-a', 'id-a', 'id-b', 'id-b', 'id-a'] } }}
        />,
      );

      const carousel = screen.getByTestId('ui-resource-carousel');
      expect(carousel).toHaveAttribute('data-resource-count', '5');

      const resources = screen.getAllByTestId(/resource-\d/);
      expect(resources).toHaveLength(5);
      expect(resources[0]).toHaveAttribute('data-resource-uri', 'ui://test/resource-a');
      expect(resources[1]).toHaveAttribute('data-resource-uri', 'ui://test/resource-a');
      expect(resources[2]).toHaveAttribute('data-resource-uri', 'ui://test/resource-b');
      expect(resources[3]).toHaveAttribute('data-resource-uri', 'ui://test/resource-b');
      expect(resources[4]).toHaveAttribute('data-resource-uri', 'ui://test/resource-a');
    });

    it('should handle null messages data', () => {
      currentTestMessages = [];

      const { container } = renderWithRecoil(
        <MCPUIResourceCarousel node={{ properties: { resourceIds: ['test-id'] } }} />,
      );

      expect(container.firstChild).toBeNull();
    });

    it('should handle missing conversation', () => {
      mockUseMessagesConversation.mockReturnValue({
        conversation: null,
        conversationId: null,
      } as any);
      currentTestMessages = [];

      const { container } = renderWithRecoil(
        <MCPUIResourceCarousel node={{ properties: { resourceIds: ['test-id'] } }} />,
      );

      expect(container.firstChild).toBeNull();
    });
  });
});
