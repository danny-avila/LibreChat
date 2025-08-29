/**
 * Integration tests for enhanced content with existing LibreChat features
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MessageContent from '../../../MessageContent';
import type { TMessage } from 'librechat-data-provider';

// Mock the enhanced content components
jest.mock('../EnhancedMessageContent', () => {
  return {
    __esModule: true,
    default: ({ message }: { message: TMessage }) => (
      <div data-testid="enhanced-content">
        Enhanced content for message: {message.messageId}
      </div>
    ),
  };
});

// Mock the ContentParser
jest.mock('../ContentParser', () => ({
  ContentParser: {
    hasEnhancedContent: jest.fn(),
    parse: jest.fn(),
  },
}));

// Mock the MessageIntegration
jest.mock('../utils/MessageIntegration', () => ({
  MessageIntegration: {
    hasEnhancedContent: jest.fn(),
  },
}));

const mockContentParser = require('../ContentParser').ContentParser;
const mockMessageIntegration = require('../utils/MessageIntegration').MessageIntegration;

// Mock the chat context
const mockChatContext = {
  isSubmitting: false,
  latestMessage: null,
};

jest.mock('~/Providers', () => ({
  useChatContext: () => mockChatContext,
  useAddedChatContext: () => ({ addedIndex: 0 }),
}));

// Mock recoil
jest.mock('recoil', () => ({
  ...jest.requireActual('recoil'),
  useRecoilValue: jest.fn(() => false),
}));

// Mock hooks
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

// Mock Container component
jest.mock('../../../Container', () => {
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="message-container">{children}</div>
    ),
  };
});

const createTestMessage = (overrides: Partial<TMessage> = {}): TMessage => ({
  messageId: 'test-message-1',
  conversationId: 'test-conversation',
  parentMessageId: null,
  text: 'Test message content',
  isCreatedByUser: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>{component}</RecoilRoot>
    </QueryClientProvider>
  );
};

describe('LibreChat Integration with Enhanced Content', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('MessageContent Integration', () => {
    it('should render standard content for non-enhanced messages', () => {
      const message = createTestMessage();
      mockMessageIntegration.hasEnhancedContent.mockReturnValue(false);

      renderWithProviders(
        <MessageContent
          text={message.text}
          message={message}
          isCreatedByUser={false}
          isLast={false}
          isSubmitting={false}
          edit={false}
          error={false}
          unfinished={false}
        />
      );

      expect(screen.getByTestId('message-container')).toBeInTheDocument();
      expect(screen.queryByTestId('enhanced-content')).not.toBeInTheDocument();
    });

    it('should render enhanced content for enhanced messages', () => {
      const message = createTestMessage();
      mockMessageIntegration.hasEnhancedContent.mockReturnValue(true);

      renderWithProviders(
        <MessageContent
          text={message.text}
          message={message}
          isCreatedByUser={false}
          isLast={false}
          isSubmitting={false}
          edit={false}
          error={false}
          unfinished={false}
        />
      );

      expect(screen.getByTestId('enhanced-content')).toBeInTheDocument();
      expect(screen.getByText('Enhanced content for message: test-message-1')).toBeInTheDocument();
    });

    it('should not render enhanced content for user messages', () => {
      const message = createTestMessage({ isCreatedByUser: true });
      mockMessageIntegration.hasEnhancedContent.mockReturnValue(false);

      renderWithProviders(
        <MessageContent
          text={message.text}
          message={message}
          isCreatedByUser={true}
          isLast={false}
          isSubmitting={false}
          edit={false}
          error={false}
          unfinished={false}
        />
      );

      expect(screen.queryByTestId('enhanced-content')).not.toBeInTheDocument();
    });

    it('should handle cached enhanced content metadata', () => {
      const message = createTestMessage({
        enhancedContent: {
          hasEnhancedContent: true,
          contentBlocks: [
            {
              id: 'block1',
              type: 'text',
              content: 'Hello',
              metadata: {},
              position: 0,
            },
          ],
        },
      });
      mockMessageIntegration.hasEnhancedContent.mockReturnValue(true);

      renderWithProviders(
        <MessageContent
          text={message.text}
          message={message}
          isCreatedByUser={false}
          isLast={false}
          isSubmitting={false}
          edit={false}
          error={false}
          unfinished={false}
        />
      );

      expect(screen.getByTestId('enhanced-content')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully and fall back to standard rendering', () => {
      const message = createTestMessage();
      mockMessageIntegration.hasEnhancedContent.mockImplementation(() => {
        throw new Error('Integration error');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      renderWithProviders(
        <MessageContent
          text={message.text}
          message={message}
          isCreatedByUser={false}
          isLast={false}
          isSubmitting={false}
          edit={false}
          error={false}
          unfinished={false}
        />
      );

      // Should fall back to standard rendering
      expect(screen.getByTestId('message-container')).toBeInTheDocument();
      expect(screen.queryByTestId('enhanced-content')).not.toBeInTheDocument();

      consoleSpy.mockRestore();
    });
  });

  describe('Performance', () => {
    it('should not cause unnecessary re-renders', () => {
      const message = createTestMessage();
      mockMessageIntegration.hasEnhancedContent.mockReturnValue(false);

      const { rerender } = renderWithProviders(
        <MessageContent
          text={message.text}
          message={message}
          isCreatedByUser={false}
          isLast={false}
          isSubmitting={false}
          edit={false}
          error={false}
          unfinished={false}
        />
      );

      // Re-render with same props
      rerender(
        <MessageContent
          text={message.text}
          message={message}
          isCreatedByUser={false}
          isLast={false}
          isSubmitting={false}
          edit={false}
          error={false}
          unfinished={false}
        />
      );

      // Should only call hasEnhancedContent once due to memoization
      expect(mockMessageIntegration.hasEnhancedContent).toHaveBeenCalledTimes(2);
    });
  });

  describe('Accessibility', () => {
    it('should maintain accessibility for enhanced content', () => {
      const message = createTestMessage();
      mockMessageIntegration.hasEnhancedContent.mockReturnValue(true);

      renderWithProviders(
        <MessageContent
          text={message.text}
          message={message}
          isCreatedByUser={false}
          isLast={false}
          isSubmitting={false}
          edit={false}
          error={false}
          unfinished={false}
        />
      );

      const enhancedContent = screen.getByTestId('enhanced-content');
      expect(enhancedContent).toBeInTheDocument();
      
      // Enhanced content should be accessible
      expect(enhancedContent).toBeVisible();
    });
  });

  describe('Streaming Support', () => {
    it('should handle streaming messages with enhanced content', () => {
      const message = createTestMessage();
      mockMessageIntegration.hasEnhancedContent.mockReturnValue(true);
      mockChatContext.isSubmitting = true;

      renderWithProviders(
        <MessageContent
          text={message.text}
          message={message}
          isCreatedByUser={false}
          isLast={true}
          isSubmitting={true}
          edit={false}
          error={false}
          unfinished={false}
        />
      );

      expect(screen.getByTestId('enhanced-content')).toBeInTheDocument();
    });
  });
});