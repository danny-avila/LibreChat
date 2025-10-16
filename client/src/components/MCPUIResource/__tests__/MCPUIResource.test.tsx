import React from 'react';
import { render, screen } from '@testing-library/react';
import { MCPUIResource } from '../MCPUIResource';
import { useMessageContext, useChatContext } from '~/Providers';
import { useGetMessagesByConvoId } from '~/data-provider';
import { useLocalize } from '~/hooks';
import useSubmitMessage from '~/hooks/Messages/useSubmitMessage';
import { handleUIAction } from '~/utils';

// Mock dependencies
jest.mock('~/Providers');
jest.mock('~/data-provider');
jest.mock('~/hooks');
jest.mock('~/hooks/Messages/useSubmitMessage');
jest.mock('~/utils');

jest.mock('@mcp-ui/client', () => ({
  UIResourceRenderer: ({ resource, onUIAction }: any) => (
    <div
      data-testid="ui-resource-renderer"
      data-resource-uri={resource?.uri}
      onClick={() => onUIAction({ action: 'test' })}
    />
  ),
}));

const mockUseMessageContext = useMessageContext as jest.MockedFunction<typeof useMessageContext>;
const mockUseChatContext = useChatContext as jest.MockedFunction<typeof useChatContext>;
const mockUseGetMessagesByConvoId = useGetMessagesByConvoId as jest.MockedFunction<
  typeof useGetMessagesByConvoId
>;
const mockUseLocalize = useLocalize as jest.MockedFunction<typeof useLocalize>;
const mockUseSubmitMessage = useSubmitMessage as jest.MockedFunction<typeof useSubmitMessage>;
const mockHandleUIAction = handleUIAction as jest.MockedFunction<typeof handleUIAction>;

describe('MCPUIResource', () => {
  const mockLocalize = (key: string, values?: any) => {
    const translations: Record<string, string> = {
      com_ui_ui_resource_not_found: `UI resource at index ${values?.[0]} not found`,
      com_ui_ui_resource_error: `Error rendering UI resource: ${values?.[0]}`,
    };
    return translations[key] || key;
  };

  const mockSubmitMessageFn = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMessageContext.mockReturnValue({ messageId: 'msg123' } as any);
    mockUseChatContext.mockReturnValue({
      conversation: { conversationId: 'conv123' },
    } as any);
    mockUseLocalize.mockReturnValue(mockLocalize as any);
    mockUseSubmitMessage.mockReturnValue({ submitMessage: mockSubmitMessageFn } as any);
  });

  describe('resource fetching', () => {
    it('should fetch and render UI resource from message attachments', () => {
      const mockMessages = [
        {
          messageId: 'msg123',
          attachments: [
            {
              type: 'ui_resources',
              ui_resources: [
                { uri: 'ui://test/resource', mimeType: 'text/html', text: '<p>Test Resource</p>' },
              ],
            },
          ],
        },
      ];

      mockUseGetMessagesByConvoId.mockReturnValue({
        data: mockMessages,
      } as any);

      render(<MCPUIResource node={{ properties: { resourceIndex: 0 } }} />);

      const renderer = screen.getByTestId('ui-resource-renderer');
      expect(renderer).toBeInTheDocument();
      expect(renderer).toHaveAttribute('data-resource-uri', 'ui://test/resource');
    });

    it('should show not found message when resource index is out of bounds', () => {
      const mockMessages = [
        {
          messageId: 'msg123',
          attachments: [
            {
              type: 'ui_resources',
              ui_resources: [
                { uri: 'ui://test/resource', mimeType: 'text/html', text: '<p>Test Resource</p>' },
              ],
            },
          ],
        },
      ];

      mockUseGetMessagesByConvoId.mockReturnValue({
        data: mockMessages,
      } as any);

      render(<MCPUIResource node={{ properties: { resourceIndex: 5 } }} />);

      expect(screen.getByText('UI resource at index 5 not found')).toBeInTheDocument();
      expect(screen.queryByTestId('ui-resource-renderer')).not.toBeInTheDocument();
    });

    it('should show not found when target message is not found', () => {
      const mockMessages = [
        {
          messageId: 'different-msg',
          attachments: [
            {
              type: 'ui_resources',
              ui_resources: [
                { uri: 'ui://test/resource', mimeType: 'text/html', text: '<p>Test Resource</p>' },
              ],
            },
          ],
        },
      ];

      mockUseGetMessagesByConvoId.mockReturnValue({
        data: mockMessages,
      } as any);

      render(<MCPUIResource node={{ properties: { resourceIndex: 0 } }} />);

      expect(screen.getByText('UI resource at index 0 not found')).toBeInTheDocument();
    });

    it('should show not found when no ui_resources attachments', () => {
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

      render(<MCPUIResource node={{ properties: { resourceIndex: 0 } }} />);

      expect(screen.getByText('UI resource at index 0 not found')).toBeInTheDocument();
    });
  });

  describe('UI action handling', () => {
    it('should handle UI actions with handleUIAction', async () => {
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
                  text: '<p>Interactive Resource</p>',
                },
              ],
            },
          ],
        },
      ];

      mockUseGetMessagesByConvoId.mockReturnValue({
        data: mockMessages,
      } as any);

      render(<MCPUIResource node={{ properties: { resourceIndex: 0 } }} />);

      const renderer = screen.getByTestId('ui-resource-renderer');
      renderer.click();

      expect(mockHandleUIAction).toHaveBeenCalledWith({ action: 'test' }, mockSubmitMessageFn);
    });
  });

  describe('edge cases', () => {
    it('should handle empty messages array', () => {
      mockUseGetMessagesByConvoId.mockReturnValue({
        data: [],
      } as any);

      render(<MCPUIResource node={{ properties: { resourceIndex: 0 } }} />);

      expect(screen.getByText('UI resource at index 0 not found')).toBeInTheDocument();
    });

    it('should handle null messages data', () => {
      mockUseGetMessagesByConvoId.mockReturnValue({
        data: null,
      } as any);

      render(<MCPUIResource node={{ properties: { resourceIndex: 0 } }} />);

      expect(screen.getByText('UI resource at index 0 not found')).toBeInTheDocument();
    });

    it('should handle missing conversation', () => {
      mockUseChatContext.mockReturnValue({
        conversation: null,
      } as any);

      mockUseGetMessagesByConvoId.mockReturnValue({
        data: null,
      } as any);

      render(<MCPUIResource node={{ properties: { resourceIndex: 0 } }} />);

      expect(screen.getByText('UI resource at index 0 not found')).toBeInTheDocument();
    });

    it('should handle multiple attachments of ui_resources type', () => {
      const mockMessages = [
        {
          messageId: 'msg123',
          attachments: [
            {
              type: 'ui_resources',
              ui_resources: [
                { uri: 'ui://test/resource1', mimeType: 'text/html', text: '<p>Resource 1</p>' },
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

      // With global indexing across attachments, index 1 should pick the second overall resource
      // Flattened order: [resource1, resource2, resource3]
      render(<MCPUIResource node={{ properties: { resourceIndex: 1 } }} />);

      const renderer = screen.getByTestId('ui-resource-renderer');
      expect(renderer).toBeInTheDocument();
      expect(renderer).toHaveAttribute('data-resource-uri', 'ui://test/resource2');
    });
  });
});
