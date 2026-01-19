import { ConversationContextInterceptor } from '../ConversationContextInterceptor';
import { MCPToolCallContext } from '../types';

describe('ConversationContextInterceptor', () => {
  let interceptor: ConversationContextInterceptor;

  beforeEach(() => {
    interceptor = new ConversationContextInterceptor({
      maxMessages: 50,
      includeSystemMessages: false,
    });
  });

  it('should have correct name and priority', () => {
    expect(interceptor.name).toBe('conversation-context');
    expect(interceptor.priority).toBe(10);
  });

  describe('intercept', () => {
    it('should inject conversation metadata for tools that need context', async () => {
      const context: MCPToolCallContext = {
        conversationId: 'test-conversation-123',
        userId: 'user-123',
        messageId: 'msg-123',
        toolName: 'summarize_conversation',
        originalArgs: { content: 'test' },
        runtime: {
          user: { id: 'user-123' },
        },
      };

      // Mock next to return current context.originalArgs at call time
      const next = jest.fn().mockImplementation(() => Promise.resolve(context.originalArgs));
      const result = await interceptor.intercept(context, next);

      expect(context.originalArgs._conversation_metadata).toBeDefined();
      expect(context.originalArgs._conversation_metadata.conversationId).toBe('test-conversation-123');
      expect(context.originalArgs._conversation_metadata.injectedAt).toBeDefined();
      expect(context.originalArgs._conversation_metadata._note).toBeDefined();
      expect(result._conversation_metadata).toBeDefined();
      expect(next).toHaveBeenCalled();
    });

    it('should skip context injection for tools that do not need context', async () => {
      const context: MCPToolCallContext = {
        conversationId: 'test-conversation-123',
        toolName: 'calculate_metrics',
        originalArgs: { data: 'test' },
        runtime: {},
      };

      const next = jest.fn().mockResolvedValue(context.originalArgs);
      await interceptor.intercept(context, next);

      expect(context.originalArgs._conversation_metadata).toBeUndefined();
      expect(context.originalArgs).toEqual({ data: 'test' });
    });

    it('should handle missing conversationId gracefully', async () => {
      const context: MCPToolCallContext = {
        toolName: 'summarize_conversation',
        originalArgs: { content: 'test' },
        runtime: {},
      };

      const next = jest.fn().mockResolvedValue(context.originalArgs);
      await interceptor.intercept(context, next);

      expect(context.originalArgs._conversation_metadata).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('should preserve original args while adding metadata', async () => {
      const originalArgs = {
        text: 'Hello world',
        language: 'en',
      };

      const context: MCPToolCallContext = {
        conversationId: 'conv-123',
        toolName: 'summarize_text',
        originalArgs: { ...originalArgs },
        runtime: {},
      };

      const next = jest.fn().mockResolvedValue(context.originalArgs);
      await interceptor.intercept(context, next);

      expect(context.originalArgs.text).toBe(originalArgs.text);
      expect(context.originalArgs.language).toBe(originalArgs.language);
      expect(context.originalArgs._conversation_metadata).toBeDefined();
    });
  });

  describe('shouldInjectContext', () => {
    it('should match tool names with summarize pattern', async () => {
      const toolNames = [
        'summarize',
        'long_conversation_summarize',
        'summarize_document',
      ];

      for (const toolName of toolNames) {
        const context: MCPToolCallContext = {
          conversationId: 'test-123',
          toolName,
          originalArgs: {},
          runtime: {},
        };

        const next = jest.fn().mockResolvedValue(context.originalArgs);
        await interceptor.intercept(context, next);

        expect(context.originalArgs._conversation_metadata).toBeDefined();
      }
    });

    it('should match tool names with analyze_conversation pattern', async () => {
      const toolNames = [
        'analyze_conversation',
        'analyze_conversation_sentiment',
        'quick_analyze_conversation',
      ];

      for (const toolName of toolNames) {
        const context: MCPToolCallContext = {
          conversationId: 'test-123',
          toolName,
          originalArgs: {},
          runtime: {},
        };

        const next = jest.fn().mockResolvedValue(context.originalArgs);
        await interceptor.intercept(context, next);

        expect(context.originalArgs._conversation_metadata).toBeDefined();
      }
    });

    it('should match tool names with extract_topics pattern', async () => {
      const toolNames = [
        'extract_topics',
        'extract_topics_from_chat',
        'extract_topics_and_keywords',
      ];

      for (const toolName of toolNames) {
        const context: MCPToolCallContext = {
          conversationId: 'test-123',
          toolName,
          originalArgs: {},
          runtime: {},
        };

        const next = jest.fn().mockResolvedValue(context.originalArgs);
        await interceptor.intercept(context, next);

        expect(context.originalArgs._conversation_metadata).toBeDefined();
      }
    });

    it('should match tool names with sentiment_analysis pattern', async () => {
      const toolNames = [
        'sentiment_analysis',
        'perform_sentiment_analysis',
        'batch_sentiment_analysis',
      ];

      for (const toolName of toolNames) {
        const context: MCPToolCallContext = {
          conversationId: 'test-123',
          toolName,
          originalArgs: {},
          runtime: {},
        };

        const next = jest.fn().mockResolvedValue(context.originalArgs);
        await interceptor.intercept(context, next);

        expect(context.originalArgs._conversation_metadata).toBeDefined();
      }
    });

    it('should be case-insensitive when matching patterns', async () => {
      const toolNames = [
        'Summarize_Conversation',
        'ANALYZE_CONVERSATION',
        'Extract_Topics',
      ];

      for (const toolName of toolNames) {
        const context: MCPToolCallContext = {
          conversationId: 'test-123',
          toolName,
          originalArgs: {},
          runtime: {},
        };

        const next = jest.fn().mockResolvedValue(context.originalArgs);
        await interceptor.intercept(context, next);

        expect(context.originalArgs._conversation_metadata).toBeDefined();
      }
    });

    it('should not match tool names without context patterns', async () => {
      const toolNames = [
        'calculate_metrics',
        'fetch_data',
        'process_document',
        'generate_text',
      ];

      for (const toolName of toolNames) {
        const context: MCPToolCallContext = {
          conversationId: 'test-123',
          toolName,
          originalArgs: {},
          runtime: {},
        };

        const next = jest.fn().mockResolvedValue(context.originalArgs);
        await interceptor.intercept(context, next);

        expect(context.originalArgs._conversation_metadata).toBeUndefined();
      }
    });
  });

  describe('options', () => {
    it('should use default options when none provided', () => {
      const defaultInterceptor = new ConversationContextInterceptor();
      expect(defaultInterceptor).toBeInstanceOf(ConversationContextInterceptor);
    });

    it('should accept custom maxMessages option', () => {
      const customInterceptor = new ConversationContextInterceptor({
        maxMessages: 100,
        includeSystemMessages: true,
      });
      expect(customInterceptor).toBeInstanceOf(ConversationContextInterceptor);
    });
  });
});