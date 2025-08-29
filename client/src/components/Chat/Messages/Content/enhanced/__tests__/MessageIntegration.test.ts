/**
 * Tests for MessageIntegration utility
 */

import { MessageIntegration } from '../utils/MessageIntegration';
import type { TMessage } from 'librechat-data-provider';

// Mock ContentParser
jest.mock('../ContentParser', () => ({
  ContentParser: {
    parse: jest.fn(),
    hasEnhancedContent: jest.fn(),
  },
}));

const mockContentParser = require('../ContentParser').ContentParser;

describe('MessageIntegration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('hasEnhancedContent', () => {
    it('should return false for user messages', () => {
      const message: TMessage = {
        messageId: '1',
        text: 'Hello world',
        isCreatedByUser: true,
        conversationId: 'conv1',
        parentMessageId: null,
      } as TMessage;

      expect(MessageIntegration.hasEnhancedContent(message)).toBe(false);
    });

    it('should return true if cached metadata indicates enhanced content', () => {
      const message: TMessage = {
        messageId: '1',
        text: 'Hello world',
        isCreatedByUser: false,
        conversationId: 'conv1',
        parentMessageId: null,
        enhancedContent: {
          hasEnhancedContent: true,
          contentBlocks: [],
        },
      } as TMessage;

      expect(MessageIntegration.hasEnhancedContent(message)).toBe(true);
    });

    it('should parse content if no cached metadata', () => {
      const message: TMessage = {
        messageId: '1',
        text: 'Hello world',
        isCreatedByUser: false,
        conversationId: 'conv1',
        parentMessageId: null,
      } as TMessage;

      mockContentParser.hasEnhancedContent.mockReturnValue(true);

      expect(MessageIntegration.hasEnhancedContent(message)).toBe(true);
      expect(mockContentParser.hasEnhancedContent).toHaveBeenCalledWith('Hello world');
    });
  });

  describe('processMessageForEnhancedContent', () => {
    it('should skip processing for user messages', () => {
      const message: TMessage = {
        messageId: '1',
        text: 'Hello world',
        isCreatedByUser: true,
        conversationId: 'conv1',
        parentMessageId: null,
      } as TMessage;

      const result = MessageIntegration.processMessageForEnhancedContent(message);
      expect(result).toBe(message);
    });

    it('should skip processing if already processed', () => {
      const message: TMessage = {
        messageId: '1',
        text: 'Hello world',
        isCreatedByUser: false,
        conversationId: 'conv1',
        parentMessageId: null,
        enhancedContent: {
          hasEnhancedContent: true,
          contentBlocks: [],
        },
      } as TMessage;

      const result = MessageIntegration.processMessageForEnhancedContent(message);
      expect(result).toBe(message);
    });

    it('should process message with enhanced content', () => {
      const message: TMessage = {
        messageId: '1',
        text: 'Hello world',
        isCreatedByUser: false,
        conversationId: 'conv1',
        parentMessageId: null,
      } as TMessage;

      const mockBlocks = [
        {
          id: 'block1',
          type: 'text',
          content: 'Hello',
          metadata: {},
          position: 0,
        },
      ];

      mockContentParser.parse.mockReturnValue({
        hasEnhancedContent: true,
        blocks: mockBlocks,
      });

      const result = MessageIntegration.processMessageForEnhancedContent(message);
      
      expect(result.enhancedContent).toEqual({
        hasEnhancedContent: true,
        contentBlocks: mockBlocks,
      });
    });

    it('should handle parsing errors gracefully', () => {
      const message: TMessage = {
        messageId: '1',
        text: 'Hello world',
        isCreatedByUser: false,
        conversationId: 'conv1',
        parentMessageId: null,
      } as TMessage;

      mockContentParser.parse.mockImplementation(() => {
        throw new Error('Parse error');
      });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = MessageIntegration.processMessageForEnhancedContent(message);
      
      expect(result).toBe(message);
      expect(consoleSpy).toHaveBeenCalledWith('Error processing message for enhanced content:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe('clearEnhancedContentCache', () => {
    it('should remove enhanced content from message', () => {
      const message: TMessage = {
        messageId: '1',
        text: 'Hello world',
        isCreatedByUser: false,
        conversationId: 'conv1',
        parentMessageId: null,
        enhancedContent: {
          hasEnhancedContent: true,
          contentBlocks: [],
        },
      } as TMessage;

      const result = MessageIntegration.clearEnhancedContentCache(message);
      
      expect(result.enhancedContent).toBeUndefined();
      expect(result.messageId).toBe('1');
      expect(result.text).toBe('Hello world');
    });

    it('should return message unchanged if no enhanced content', () => {
      const message: TMessage = {
        messageId: '1',
        text: 'Hello world',
        isCreatedByUser: false,
        conversationId: 'conv1',
        parentMessageId: null,
      } as TMessage;

      const result = MessageIntegration.clearEnhancedContentCache(message);
      expect(result).toBe(message);
    });
  });

  describe('getContentSummary', () => {
    it('should return plain text for non-enhanced messages', () => {
      const message: TMessage = {
        messageId: '1',
        text: 'Hello world',
        isCreatedByUser: false,
        conversationId: 'conv1',
        parentMessageId: null,
      } as TMessage;

      mockContentParser.hasEnhancedContent.mockReturnValue(false);

      const result = MessageIntegration.getContentSummary(message);
      expect(result).toBe('Hello world');
    });

    it('should return summary for enhanced messages', () => {
      const message: TMessage = {
        messageId: '1',
        text: 'Hello world',
        isCreatedByUser: false,
        conversationId: 'conv1',
        parentMessageId: null,
        enhancedContent: {
          hasEnhancedContent: true,
          contentBlocks: [
            { id: '1', type: 'text', content: 'Hello', metadata: {}, position: 0 },
            { id: '2', type: 'chart', content: 'data', metadata: {}, position: 1 },
          ],
        },
      } as TMessage;

      const result = MessageIntegration.getContentSummary(message);
      expect(result).toBe('Enhanced content with 2 blocks: text, chart');
    });
  });

  describe('compatibility checks', () => {
    it('should indicate compatibility with artifacts', () => {
      const message: TMessage = {
        messageId: '1',
        text: 'Hello world',
        isCreatedByUser: false,
        conversationId: 'conv1',
        parentMessageId: null,
      } as TMessage;

      expect(MessageIntegration.isCompatibleWithArtifacts(message)).toBe(true);
    });

    it('should indicate compatibility with file uploads', () => {
      const message: TMessage = {
        messageId: '1',
        text: 'Hello world',
        isCreatedByUser: false,
        conversationId: 'conv1',
        parentMessageId: null,
      } as TMessage;

      expect(MessageIntegration.isCompatibleWithFileUploads(message)).toBe(true);
    });
  });
});