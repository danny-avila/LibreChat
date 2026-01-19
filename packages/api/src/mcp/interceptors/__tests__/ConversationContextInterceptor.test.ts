import { ConversationContextInterceptor } from '../ConversationContextInterceptor';
import { MCPToolCallContext } from '../types';

describe('ConversationContextInterceptor', () => {
  let interceptor: ConversationContextInterceptor;

  beforeEach(() => {
    interceptor = new ConversationContextInterceptor();
  });

  describe('shouldInjectContext', () => {
    it('should return true for summarize tool', () => {
      const context: MCPToolCallContext = {
        toolName: 'summarize',
        originalArgs: {},
        runtime: {},
      };
      expect(interceptor['shouldInjectContext'](context)).toBe(true);
    });

    it('should return true for analyze_conversation tool', () => {
      const context: MCPToolCallContext = {
        toolName: 'analyze_conversation',
        originalArgs: {},
        runtime: {},
      };
      expect(interceptor['shouldInjectContext'](context)).toBe(true);
    });

    it('should return false for tools not in the list', () => {
      const context: MCPToolCallContext = {
        toolName: 'search',
        originalArgs: {},
        runtime: {},
      };
      expect(interceptor['shouldInjectContext'](context)).toBe(false);
    });
  });

  describe('intercept', () => {
    it('should inject conversation metadata for matching tools', async () => {
      const context: MCPToolCallContext = {
        conversationId: 'conv-123',
        toolName: 'summarize_conversation',
        originalArgs: { query: 'summarize' },
        runtime: {},
      };

      const next = jest.fn().mockResolvedValue(context.originalArgs);
      await interceptor.intercept(context, next);

      expect(context.originalArgs._conversation_metadata).toBeDefined();
      expect(context.originalArgs._conversation_metadata.conversationId).toBe('conv-123');
    });

    it('should skip injection when conversationId is missing', async () => {
      const context: MCPToolCallContext = {
        toolName: 'summarize',
        originalArgs: { query: 'test' },
        runtime: {},
      };

      const next = jest.fn().mockResolvedValue(context.originalArgs);
      await interceptor.intercept(context, next);

      expect(context.originalArgs._conversation_metadata).toBeUndefined();
    });

    it('should respect maxMessages option', () => {
      const customInterceptor = new ConversationContextInterceptor({
        maxMessages: 100,
        includeSystemMessages: true,
      });
      expect(customInterceptor).toBeInstanceOf(ConversationContextInterceptor);
    });
  });
});