import { InterceptorManager } from '../InterceptorManager';
import { MCPInterceptor, MCPToolCallContext } from '../types';

describe('InterceptorManager', () => {
  it('should execute interceptors in priority order', async () => {
    const executionOrder: string[] = [];

    const interceptor1: MCPInterceptor = {
      name: 'interceptor1',
      priority: 20,
      intercept: async (context, next) => {
        executionOrder.push('interceptor1-start');
        const result = await next();
        executionOrder.push('interceptor1-end');
        return result;
      },
    };

    const interceptor2: MCPInterceptor = {
      name: 'interceptor2',
      priority: 10,
      intercept: async (context, next) => {
        executionOrder.push('interceptor2-start');
        const result = await next();
        executionOrder.push('interceptor2-end');
        return result;
      },
    };

    const manager = new InterceptorManager({
      enabled: true,
      interceptors: ['interceptor1', 'interceptor2'],
    });

    manager.register(interceptor1);
    manager.register(interceptor2);

    const context: MCPToolCallContext = {
      toolName: 'test-tool',
      originalArgs: { initial: true },
      runtime: {},
    };

    await manager.executeInterceptors(context);

    expect(executionOrder).toEqual([
      'interceptor2-start',
      'interceptor1-start',
      'interceptor1-end',
      'interceptor2-end',
    ]);
  });

  it('should allow interceptors to modify arguments', async () => {
    const interceptor: MCPInterceptor = {
      name: 'modifier',
      priority: 10,
      intercept: async (context, next) => {
        context.originalArgs.modified = true;
        return next();
      },
    };

    const manager = new InterceptorManager({
      enabled: true,
      interceptors: ['modifier'],
    });

    manager.register(interceptor);

    const context: MCPToolCallContext = {
      toolName: 'test-tool',
      originalArgs: { initial: true },
      runtime: {},
    };

    const result = await manager.executeInterceptors(context);
    expect(result).toEqual({ initial: true, modified: true });
  });

  describe('ConversationContextInterceptor', () => {
    it('should inject conversation metadata for tools that need context', async () => {
      const { ConversationContextInterceptor } = await import('../ConversationContextInterceptor');
      
      const interceptor = new ConversationContextInterceptor({
        maxMessages: 50,
        includeSystemMessages: false,
      });

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

      const next = jest.fn().mockResolvedValue(context.originalArgs);
      await interceptor.intercept(context, next);

      expect(context.originalArgs._conversation_metadata).toBeDefined();
      expect(context.originalArgs._conversation_metadata.conversationId).toBe('test-conversation-123');
      expect(context.originalArgs._conversation_metadata.injectedAt).toBeDefined();
    });

    it('should skip context injection for tools that do not need context', async () => {
      const { ConversationContextInterceptor } = await import('../ConversationContextInterceptor');
      
      const interceptor = new ConversationContextInterceptor();

      const context: MCPToolCallContext = {
        conversationId: 'test-conversation-123',
        toolName: 'calculate_metrics',
        originalArgs: { data: 'test' },
        runtime: {},
      };

      const next = jest.fn().mockResolvedValue(context.originalArgs);
      await interceptor.intercept(context, next);

      expect(context.originalArgs._conversation_metadata).toBeUndefined();
    });

    it('should handle missing conversationId gracefully', async () => {
      const { ConversationContextInterceptor } = await import('../ConversationContextInterceptor');
      
      const interceptor = new ConversationContextInterceptor();

      const context: MCPToolCallContext = {
        toolName: 'summarize_conversation',
        originalArgs: { content: 'test' },
        runtime: {},
      };

      const next = jest.fn().mockResolvedValue(context.originalArgs);
      await interceptor.intercept(context, next);

      expect(context.originalArgs._conversation_metadata).toBeUndefined();
    });

    it('should match tool names with summarize pattern', async () => {
      const { ConversationContextInterceptor } = await import('../ConversationContextInterceptor');
      
      const interceptor = new ConversationContextInterceptor();

      const toolNames = [
        'summarize',
        'long_conversation_summarize',
        'analyze_conversation_sentiment',
        'extract_topics_from_chat',
        'perform_sentiment_analysis',
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
  });
});
