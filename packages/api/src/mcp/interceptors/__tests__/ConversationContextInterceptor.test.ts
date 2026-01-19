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

    it('should be case insensitive', () => {
      const context: MCPToolCallContext = {
        toolName: 'SUMMARIZE_CONVERSATION',
        originalArgs: {},
        runtime: {},
      };
      expect(interceptor['shouldInjectContext'](context)).toBe(true);
    });
  });

  describe('intercept', () => {
    it('should call next without modification when tool does not need context', async () => {
      const context: MCPToolCallContext = {
        toolName: 'search',
        originalArgs: { query: 'test' },
        runtime: {},
      };
      const next = jest.fn().mockResolvedValue(context.originalArgs);
      
      const result = await interceptor.intercept(context, next);
      
      expect(next).toHaveBeenCalled();
      expect(result).toEqual({ query: 'test' });
    });

    it('should call next without modification when conversationId is missing', async () => {
      const context: MCPToolCallContext = {
        toolName: 'summarize',
        originalArgs: {},
        runtime: {},
      };
      const next = jest.fn().mockResolvedValue(context.originalArgs);
      
      const result = await interceptor.intercept(context, next);
      
      expect(next).toHaveBeenCalled();
      expect(result).toEqual({});
    });

    it('should inject conversation metadata when conditions are met', async () => {
      const context: MCPToolCallContext = {
        conversationId: 'conv-123',
        messageId: 'msg-123',
        toolName: 'summarize_conversation',
        originalArgs: { content: 'hello' },
        runtime: {},
      };
      const next = jest.fn().mockResolvedValue(context.originalArgs);
      
      await interceptor.intercept(context, next);

      expect(context.originalArgs._conversation_metadata).toBeDefined();
      expect(context.originalArgs._conversation_metadata).toHaveProperty('conversationId', 'conv-123');
      expect(context.originalArgs._conversation_metadata).toHaveProperty('timestamp');
    });

    it('should preserve original arguments when injecting metadata', async () => {
      const context: MCPToolCallContext = {
        conversationId: 'conv-123',
        toolName: 'summarize',
        originalArgs: { query: 'test', limit: 10 },
        runtime: {},
      };
      const next = jest.fn().mockResolvedValue(context.originalArgs);
      
      await interceptor.intercept(context, next);

      expect(context.originalArgs.query).toBe('test');
      expect(context.originalArgs.limit).toBe(10);
      expect(context.originalArgs._conversation_metadata).toBeDefined();
    });
  });

  describe('constructor options', () => {
    it('should accept custom maxMessages option', () => {
      const customInterceptor = new ConversationContextInterceptor({
        maxMessages: 100,
        includeSystemMessages: true,
      });
      expect(customInterceptor).toBeInstanceOf(ConversationContextInterceptor);
    });
  });
});