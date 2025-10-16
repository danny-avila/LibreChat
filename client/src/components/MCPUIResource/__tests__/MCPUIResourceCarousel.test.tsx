import React from 'react';
import { render, screen } from '@testing-library/react';
import { MCPUIResourceCarousel } from '../MCPUIResourceCarousel';
import { useMessageContext, useChatContext } from '~/Providers';
import { useGetMessagesByConvoId } from '~/data-provider';

// Mock dependencies
jest.mock('~/Providers');
jest.mock('~/data-provider');

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
const mockUseChatContext = useChatContext as jest.MockedFunction<typeof useChatContext>;
const mockUseGetMessagesByConvoId = useGetMessagesByConvoId as jest.MockedFunction<
  typeof useGetMessagesByConvoId
>;

describe('MCPUIResourceCarousel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMessageContext.mockReturnValue({ messageId: 'msg123' } as any);
    mockUseChatContext.mockReturnValue({
      conversation: { conversationId: 'conv123' },
    } as any);
  });

  describe('multiple resource fetching', () => {
    it('should fetch multiple resources by indices', () => {
      const mockMessages = [
        {
          messageId: 'msg123',
          attachments: [
            {
              type: 'ui_resources',
              ui_resources: [
                {
                  uri: 'ui://test/resource0',
                  mimeType: 'text/html',
                  text: '<p>Resource 0 content</p>',
                },
                {
                  uri: 'ui://test/resource1',
                  mimeType: 'text/html',
                  text: '<p>Resource 1 content</p>',
                },
                {
                  uri: 'ui://test/resource2',
                  mimeType: 'text/html',
                  text: '<p>Resource 2 content</p>',
                },
                {
                  uri: 'ui://test/resource3',
                  mimeType: 'text/html',
                  text: '<p>Resource 3 content</p>',
                },
              ],
            },
          ],
        },
      ];

      mockUseGetMessagesByConvoId.mockReturnValue({
        data: mockMessages,
      } as any);

      render(<MCPUIResourceCarousel node={{ properties: { resourceIndices: [0, 2, 3] } }} />);

      const carousel = screen.getByTestId('ui-resource-carousel');
      expect(carousel).toBeInTheDocument();
      expect(carousel).toHaveAttribute('data-resource-count', '3');

      expect(screen.getByTestId('resource-0')).toHaveAttribute(
        'data-resource-uri',
        'ui://test/resource0',
      );
      expect(screen.getByTestId('resource-1')).toHaveAttribute(
        'data-resource-uri',
        'ui://test/resource2',
      );
      expect(screen.getByTestId('resource-2')).toHaveAttribute(
        'data-resource-uri',
        'ui://test/resource3',
      );
      expect(screen.queryByTestId('resource-3')).not.toBeInTheDocument();
    });

    it('should preserve resource order based on indices', () => {
      const mockMessages = [
        {
          messageId: 'msg123',
          attachments: [
            {
              type: 'ui_resources',
              ui_resources: [
                {
                  uri: 'ui://test/resource0',
                  mimeType: 'text/html',
                  text: '<p>Resource 0 content</p>',
                },
                {
                  uri: 'ui://test/resource1',
                  mimeType: 'text/html',
                  text: '<p>Resource 1 content</p>',
                },
                {
                  uri: 'ui://test/resource2',
                  mimeType: 'text/html',
                  text: '<p>Resource 2 content</p>',
                },
              ],
            },
          ],
        },
      ];

      mockUseGetMessagesByConvoId.mockReturnValue({
        data: mockMessages,
      } as any);

      render(<MCPUIResourceCarousel node={{ properties: { resourceIndices: [2, 0, 1] } }} />);

      const resources = screen.getAllByTestId(/resource-\d/);
      expect(resources[0]).toHaveAttribute('data-resource-uri', 'ui://test/resource2');
      expect(resources[1]).toHaveAttribute('data-resource-uri', 'ui://test/resource0');
      expect(resources[2]).toHaveAttribute('data-resource-uri', 'ui://test/resource1');
    });
  });

  describe('partial matches', () => {
    it('should only include valid resource indices', () => {
      const mockMessages = [
        {
          messageId: 'msg123',
          attachments: [
            {
              type: 'ui_resources',
              ui_resources: [
                {
                  uri: 'ui://test/resource0',
                  mimeType: 'text/html',
                  text: '<p>Resource 0 content</p>',
                },
                {
                  uri: 'ui://test/resource1',
                  mimeType: 'text/html',
                  text: '<p>Resource 1 content</p>',
                },
              ],
            },
          ],
        },
      ];

      mockUseGetMessagesByConvoId.mockReturnValue({
        data: mockMessages,
      } as any);

      // Request indices 0, 1, 2, 3 but only 0 and 1 exist
      render(<MCPUIResourceCarousel node={{ properties: { resourceIndices: [0, 1, 2, 3] } }} />);

      const carousel = screen.getByTestId('ui-resource-carousel');
      expect(carousel).toHaveAttribute('data-resource-count', '2');

      expect(screen.getByTestId('resource-0')).toHaveAttribute(
        'data-resource-uri',
        'ui://test/resource0',
      );
      expect(screen.getByTestId('resource-1')).toHaveAttribute(
        'data-resource-uri',
        'ui://test/resource1',
      );
    });

    it('should handle all invalid indices', () => {
      const mockMessages = [
        {
          messageId: 'msg123',
          attachments: [
            {
              type: 'ui_resources',
              ui_resources: [
                {
                  uri: 'ui://test/resource0',
                  mimeType: 'text/html',
                  text: '<p>Resource 0 content</p>',
                },
                {
                  uri: 'ui://test/resource1',
                  mimeType: 'text/html',
                  text: '<p>Resource 1 content</p>',
                },
              ],
            },
          ],
        },
      ];

      mockUseGetMessagesByConvoId.mockReturnValue({
        data: mockMessages,
      } as any);

      // Request indices that don't exist
      render(<MCPUIResourceCarousel node={{ properties: { resourceIndices: [5, 6, 7] } }} />);

      expect(screen.queryByTestId('ui-resource-carousel')).not.toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('should return null when no attachments', () => {
      const mockMessages = [
        {
          messageId: 'msg123',
          attachments: undefined,
        },
      ];

      mockUseGetMessagesByConvoId.mockReturnValue({
        data: mockMessages,
      } as any);

      const { container } = render(
        <MCPUIResourceCarousel node={{ properties: { resourceIndices: [0, 1] } }} />,
      );

      expect(container.firstChild).toBeNull();
      expect(screen.queryByTestId('ui-resource-carousel')).not.toBeInTheDocument();
    });

    it('should return null when message not found', () => {
      const mockMessages = [
        {
          messageId: 'different-msg',
          attachments: [
            {
              type: 'ui_resources',
              ui_resources: [
                {
                  uri: 'ui://test/resource',
                  mimeType: 'text/html',
                  text: '<p>Resource content</p>',
                },
              ],
            },
          ],
        },
      ];

      mockUseGetMessagesByConvoId.mockReturnValue({
        data: mockMessages,
      } as any);

      const { container } = render(
        <MCPUIResourceCarousel node={{ properties: { resourceIndices: [0] } }} />,
      );

      expect(container.firstChild).toBeNull();
    });

    it('should return null when no ui_resources attachments', () => {
      const mockMessages = [
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

      mockUseGetMessagesByConvoId.mockReturnValue({
        data: mockMessages,
      } as any);

      const { container } = render(
        <MCPUIResourceCarousel node={{ properties: { resourceIndices: [0, 1] } }} />,
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle empty resourceIndices array', () => {
      const mockMessages = [
        {
          messageId: 'msg123',
          attachments: [
            {
              type: 'ui_resources',
              ui_resources: [
                {
                  uri: 'ui://test/resource',
                  mimeType: 'text/html',
                  text: '<p>Resource content</p>',
                },
              ],
            },
          ],
        },
      ];

      mockUseGetMessagesByConvoId.mockReturnValue({
        data: mockMessages,
      } as any);

      const { container } = render(
        <MCPUIResourceCarousel node={{ properties: { resourceIndices: [] } }} />,
      );

      expect(container.firstChild).toBeNull();
    });

    it('should handle duplicate indices', () => {
      const mockMessages = [
        {
          messageId: 'msg123',
          attachments: [
            {
              type: 'ui_resources',
              ui_resources: [
                {
                  uri: 'ui://test/resource0',
                  mimeType: 'text/html',
                  text: '<p>Resource 0 content</p>',
                },
                {
                  uri: 'ui://test/resource1',
                  mimeType: 'text/html',
                  text: '<p>Resource 1 content</p>',
                },
              ],
            },
          ],
        },
      ];

      mockUseGetMessagesByConvoId.mockReturnValue({
        data: mockMessages,
      } as any);

      // Request same index multiple times
      render(<MCPUIResourceCarousel node={{ properties: { resourceIndices: [0, 0, 1, 1, 0] } }} />);

      // Should render each resource multiple times
      const carousel = screen.getByTestId('ui-resource-carousel');
      expect(carousel).toHaveAttribute('data-resource-count', '5');

      const resources = screen.getAllByTestId(/resource-\d/);
      expect(resources).toHaveLength(5);
      expect(resources[0]).toHaveAttribute('data-resource-uri', 'ui://test/resource0');
      expect(resources[1]).toHaveAttribute('data-resource-uri', 'ui://test/resource0');
      expect(resources[2]).toHaveAttribute('data-resource-uri', 'ui://test/resource1');
      expect(resources[3]).toHaveAttribute('data-resource-uri', 'ui://test/resource1');
      expect(resources[4]).toHaveAttribute('data-resource-uri', 'ui://test/resource0');
    });

    it('should handle multiple ui_resources attachments', () => {
      const mockMessages = [
        {
          messageId: 'msg123',
          attachments: [
            {
              type: 'ui_resources',
              ui_resources: [
                {
                  uri: 'ui://test/resource0',
                  mimeType: 'text/html',
                  text: '<p>Resource 0 content</p>',
                },
                {
                  uri: 'ui://test/resource1',
                  mimeType: 'text/html',
                  text: '<p>Resource 1 content</p>',
                },
              ],
            },
            {
              type: 'ui_resources',
              ui_resources: [
                { uri: 'ui://test/resource2', mimeType: 'text/html', text: '<p>Resource 2</p>' },
                { uri: 'ui://test/resource3', mimeType: 'text/html', text: '<p>Resource 3</p>' },
              ],
            },
          ],
        },
      ];

      mockUseGetMessagesByConvoId.mockReturnValue({
        data: mockMessages,
      } as any);

      // Resources from both attachments should be accessible
      render(<MCPUIResourceCarousel node={{ properties: { resourceIndices: [0, 2, 3] } }} />);

      const carousel = screen.getByTestId('ui-resource-carousel');
      expect(carousel).toHaveAttribute('data-resource-count', '3');

      // Note: indices 2 and 3 are from the second attachment and become accessible in the flattened array
      expect(screen.getByTestId('resource-0')).toHaveAttribute(
        'data-resource-uri',
        'ui://test/resource0',
      );
      expect(screen.getByTestId('resource-1')).toHaveAttribute(
        'data-resource-uri',
        'ui://test/resource2',
      );
      expect(screen.getByTestId('resource-2')).toHaveAttribute(
        'data-resource-uri',
        'ui://test/resource3',
      );
    });

    it('should handle null messages data', () => {
      mockUseGetMessagesByConvoId.mockReturnValue({
        data: null,
      } as any);

      const { container } = render(
        <MCPUIResourceCarousel node={{ properties: { resourceIndices: [0] } }} />,
      );

      expect(container.firstChild).toBeNull();
    });

    it('should handle missing conversation', () => {
      mockUseChatContext.mockReturnValue({
        conversation: null,
      } as any);

      mockUseGetMessagesByConvoId.mockReturnValue({
        data: null,
      } as any);

      const { container } = render(
        <MCPUIResourceCarousel node={{ properties: { resourceIndices: [0] } }} />,
      );

      expect(container.firstChild).toBeNull();
    });
  });
});
