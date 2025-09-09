import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { visit } from 'unist-util-visit';
import { Artifact, artifactPlugin } from './Artifact';
import * as utils from '~/utils';
import { useMessageContext, useArtifactContext, useChatContext } from '~/Providers';
import useSubmitMessage from '~/hooks/Messages/useSubmitMessage';
import { useUIResources } from '~/hooks';
import { useGetMessagesByConvoId } from '~/data-provider';

// Mock all external dependencies
jest.mock('unist-util-visit');
jest.mock('~/utils');
jest.mock('~/Providers');
jest.mock('~/hooks/Messages/useSubmitMessage');
jest.mock('~/hooks');
jest.mock('~/data-provider');
jest.mock('@mcp-ui/client', () => ({
  UIResourceRenderer: ({ resource }: any) => (
    <div data-testid="ui-resource-renderer">{`UI Resource: ${resource?.uri}`}</div>
  ),
}));
jest.mock('../Chat/Messages/Content/UIResourceCarousel', () => ({
  __esModule: true,
  default: ({ uiResources }: any) => (
    <div data-testid="ui-resource-carousel">{`Carousel: ${uiResources?.length} resources`}</div>
  ),
}));
jest.mock('./ArtifactButton', () => ({
  __esModule: true,
  default: ({ artifact }: any) => (
    <div data-testid="artifact-button">{`Button: ${artifact?.title}`}</div>
  ),
}));

const mockVisit = visit as jest.MockedFunction<typeof visit>;
const mockExtractContent = utils.extractContent as jest.MockedFunction<typeof utils.extractContent>;
const mockGetLatestText = utils.getLatestText as jest.MockedFunction<typeof utils.getLatestText>;
const _mockHandleUIAction = utils.handleUIAction as jest.MockedFunction<
  typeof utils.handleUIAction
>;
const mockLogger = { log: jest.fn() };
(utils as any).logger = mockLogger;

const mockUseMessageContext = useMessageContext as jest.MockedFunction<typeof useMessageContext>;
const mockUseArtifactContext = useArtifactContext as jest.MockedFunction<typeof useArtifactContext>;
const mockUseChatContext = useChatContext as jest.MockedFunction<typeof useChatContext>;
const mockUseSubmitMessage = useSubmitMessage as jest.MockedFunction<typeof useSubmitMessage>;
const mockUseUIResources = useUIResources as jest.MockedFunction<typeof useUIResources>;
const mockUseGetMessagesByConvoId = useGetMessagesByConvoId as jest.MockedFunction<
  typeof useGetMessagesByConvoId
>;

const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>
        <BrowserRouter>{children}</BrowserRouter>
      </RecoilRoot>
    </QueryClientProvider>
  );
};

describe('artifactPlugin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVisit.mockImplementation((tree, selector, visitor) => {
      if (typeof visitor === 'function') {
        const mockNode = { type: 'textDirective', name: 'artifact', attributes: {} };
        const mockParent = { children: [mockNode] };
        visitor(mockNode as any, 0, mockParent as any);
      }
    });
  });

  it('should replace text directives with colon-prefixed text', () => {
    const plugin = artifactPlugin();
    const tree = {};

    mockVisit.mockImplementation((tree, selector, visitor) => {
      if (typeof visitor === 'function') {
        const mockNode = { type: 'textDirective', name: 'test' };
        const mockParent = { children: [mockNode] };
        visitor(mockNode as any, 0, mockParent as any);
        expect(mockParent.children[0]).toEqual({
          type: 'text',
          value: ':test',
        });
      }
    });

    plugin(tree as any);
  });

  it('should process artifact nodes by setting hName and hProperties', () => {
    const plugin = artifactPlugin();
    const tree = {};

    mockVisit.mockImplementation((tree, selector, visitor) => {
      if (typeof visitor === 'function') {
        const mockNode = {
          type: 'containerDirective',
          name: 'artifact',
          attributes: { type: 'code' },
          data: {},
        };
        const result = visitor(mockNode as any, 0, null);
        expect(result.data).toEqual({
          hName: 'artifact',
          hProperties: { type: 'code' },
        });
      }
    });

    plugin(tree as any);
  });

  it('should return early for non-artifact nodes', () => {
    const plugin = artifactPlugin();
    const tree = {};

    mockVisit.mockImplementation((tree, selector, visitor) => {
      if (typeof visitor === 'function') {
        const mockNode = { type: 'containerDirective', name: 'other' };
        const result = visitor(mockNode as any, 0, null);
        expect(result).toBeUndefined();
      }
    });

    plugin(tree as any);
  });
});

describe('Artifact Component', () => {
  const defaultProps = {
    type: 'code',
    title: 'Test Artifact',
    identifier: 'test-id',
    children: 'console.log("test");',
    node: {},
  };

  const mockContextValues = {
    messageContext: { messageId: 'msg-123' },
    artifactContext: { getNextIndex: jest.fn(() => 0), resetCounter: jest.fn() },
    chatContext: { conversation: { conversationId: 'conv-123' } },
    submitMessage: jest.fn(),
    uiResources: { getUIResourceById: jest.fn() },
    messages: [{ messageId: 'msg-123', text: 'Test message :::artifact\ncode\n:::' }],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseMessageContext.mockReturnValue(mockContextValues.messageContext as any);
    mockUseArtifactContext.mockReturnValue(mockContextValues.artifactContext as any);
    mockUseChatContext.mockReturnValue(mockContextValues.chatContext as any);
    mockUseSubmitMessage.mockReturnValue({ submitMessage: mockContextValues.submitMessage } as any);
    mockUseUIResources.mockReturnValue(mockContextValues.uiResources as any);
    mockUseGetMessagesByConvoId.mockReturnValue({ data: mockContextValues.messages } as any);

    mockExtractContent.mockReturnValue('console.log("test");');
    mockGetLatestText.mockReturnValue('Test message :::artifact\ncode\n:::');

    Object.defineProperty(window, 'location', {
      value: { pathname: '/c/conv-123' },
      writable: true,
    });
  });

  it('should render loading spinner when artifact is incomplete', () => {
    mockGetLatestText.mockReturnValue('Test message :::artifact\nincomplete');

    render(
      <TestWrapper>
        <Artifact {...defaultProps} />
      </TestWrapper>,
    );

    expect(screen.getByText('Generating content...')).toBeInTheDocument();
    expect(document.querySelector('.spinner')).not.toBeNull();
  });

  it('should render ArtifactButton for standard artifacts', async () => {
    render(
      <TestWrapper>
        <Artifact {...defaultProps} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('artifact-button')).toBeInTheDocument();
      expect(screen.getByText('Button: Test Artifact')).toBeInTheDocument();
    });
  });

  it('should render UIResourceRenderer for mcp-ui-single type', async () => {
    const uiResource = { uri: 'test-uri', name: 'Test Resource' };
    mockContextValues.uiResources.getUIResourceById.mockReturnValue(uiResource);

    render(
      <TestWrapper>
        <Artifact {...defaultProps} type="mcp-ui-single" />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('ui-resource-renderer')).toBeInTheDocument();
      expect(screen.getByText('UI Resource: test-uri')).toBeInTheDocument();
    });
  });

  it('should render error message for mcp-ui-single when resource not found', async () => {
    mockContextValues.uiResources.getUIResourceById.mockReturnValue(undefined);

    render(
      <TestWrapper>
        <Artifact {...defaultProps} type="mcp-ui-single" />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('?? console.log("test"); ??')).toBeInTheDocument();
    });
  });

  it('should render UIResourceCarousel for mcp-ui-carousel type', async () => {
    const uiResources = [
      { uri: 'uri1', name: 'Resource 1' },
      { uri: 'uri2', name: 'Resource 2' },
    ];
    mockExtractContent.mockReturnValue('uri1, uri2');
    mockContextValues.uiResources.getUIResourceById
      .mockReturnValueOnce(uiResources[0])
      .mockReturnValueOnce(uiResources[1]);

    render(
      <TestWrapper>
        <Artifact {...defaultProps} type="mcp-ui-carousel" />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('ui-resource-carousel')).toBeInTheDocument();
      expect(screen.getByText('Carousel: 2 resources')).toBeInTheDocument();
    });
  });

  it('should render error message for mcp-ui-carousel when no resources found', async () => {
    mockExtractContent.mockReturnValue('invalid-uri1, invalid-uri2');
    mockContextValues.uiResources.getUIResourceById.mockReturnValue(undefined);

    render(
      <TestWrapper>
        <Artifact {...defaultProps} type="mcp-ui-carousel" />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('???')).toBeInTheDocument();
    });
  });

  it('should handle default values when props are missing', async () => {
    const propsWithoutDefaults = {
      children: 'test content',
      node: {},
    };

    render(
      <TestWrapper>
        <Artifact {...propsWithoutDefaults} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(mockLogger.log).toHaveBeenCalledWith(
        'artifacts',
        'updateArtifact: content.length',
        expect.any(Number),
      );
    });
  });

  it('should not update artifacts state when not in conversation path', async () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/settings' },
      writable: true,
    });

    render(
      <TestWrapper>
        <Artifact {...defaultProps} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('artifact-button')).toBeInTheDocument();
    });
  });

  it('should call resetCounter on mount', () => {
    render(
      <TestWrapper>
        <Artifact {...defaultProps} />
      </TestWrapper>,
    );

    expect(mockContextValues.artifactContext.resetCounter).toHaveBeenCalled();
  });

  it('should handle empty message text', () => {
    mockGetLatestText.mockReturnValue('');

    render(
      <TestWrapper>
        <Artifact {...defaultProps} />
      </TestWrapper>,
    );

    expect(screen.getByText('Generating content...')).toBeInTheDocument();
  });

  it('should handle missing conversation', () => {
    mockUseChatContext.mockReturnValue({ conversation: null } as any);
    mockUseGetMessagesByConvoId.mockReturnValue({ data: undefined } as any);

    render(
      <TestWrapper>
        <Artifact {...defaultProps} />
      </TestWrapper>,
    );

    expect(screen.getByText('Generating content...')).toBeInTheDocument();
  });

  describe('Edge cases', () => {
    it('should handle malformed carousel content', async () => {
      mockExtractContent.mockReturnValue('  ,  , uri1 ,   ');
      mockContextValues.uiResources.getUIResourceById
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce({ uri: 'uri1', name: 'Resource 1' })
        .mockReturnValueOnce(undefined);

      render(
        <TestWrapper>
          <Artifact {...defaultProps} type="mcp-ui-carousel" />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('ui-resource-carousel')).toBeInTheDocument();
        expect(screen.getByText('Carousel: 1 resources')).toBeInTheDocument();
      });
    });

    it('should handle artifact completion check edge cases', () => {
      const testCases = [
        { text: ':::artifact\ncontent', expected: false },
        { text: 'content\n:::', expected: false },
        { text: ':::artifact\ncontent\n:::', expected: true },
        { text: ':::artifact content :::', expected: true },
      ];

      testCases.forEach(({ text, expected }) => {
        mockGetLatestText.mockReturnValue(text);
        const { unmount } = render(
          <TestWrapper>
            <Artifact {...defaultProps} />
          </TestWrapper>,
        );

        if (expected) {
          expect(screen.queryByText('Generating content...')).not.toBeInTheDocument();
        } else {
          expect(screen.getByText('Generating content...')).toBeInTheDocument();
        }
        unmount();
      });
    });

    it('should handle throttled updates correctly', async () => {
      const { rerender } = render(
        <TestWrapper>
          <Artifact {...defaultProps} title="Title 1" />
        </TestWrapper>,
      );

      rerender(
        <TestWrapper>
          <Artifact {...defaultProps} title="Title 2" />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(mockLogger.log).toHaveBeenCalled();
      });
    });

    it('should generate correct artifact key with special characters', async () => {
      render(
        <TestWrapper>
          <Artifact
            {...defaultProps}
            title="Test Title With Spaces"
            identifier="special-chars-123"
            type="code/javascript"
          />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(mockLogger.log).toHaveBeenCalledWith(
          'artifacts',
          'updateArtifact: content.length',
          expect.any(Number),
        );
      });
    });
  });
});
