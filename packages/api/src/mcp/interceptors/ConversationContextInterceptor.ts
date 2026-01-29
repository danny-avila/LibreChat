import { logger } from '@librechat/data-schemas';
import { MCPInterceptor, MCPToolCallContext } from './types';

/**
 * ConversationContextInterceptor injects conversation history into MCP tool calls
 * 
 * Note: This interceptor is designed to work with the Message model from MongoDB.
 * Currently, it injects metadata about the conversation without full message history,
 * which allows the system to work immediately without requiring database setup.
 * To enable full conversation history injection, uncomment the Message model logic
 * when the database layer is properly configured.
 */
export class ConversationContextInterceptor implements MCPInterceptor {
  name = 'conversation-context';
  priority = 10;

  constructor(private options: {
    maxMessages?: number;
    includeSystemMessages?: boolean;
  } = {}) {}

  async intercept(
    context: MCPToolCallContext,
    next: () => Promise<Record<string, any>>
  ): Promise<Record<string, any>> {
    // Check if tool needs conversation history
    if (!this.shouldInjectContext(context)) {
      return next();
    }

    if (!context.conversationId) {
      return next();
    }

    // TODO: Enable full message history when Message model is properly set up
    // This requires database connection and Message model setup
    // For now, we inject metadata without fetching full history
    
    try {
      // Inject conversation metadata
      context.originalArgs = {
        ...context.originalArgs,
        _conversation_metadata: {
          conversationId: context.conversationId,
          timestamp: new Date().toISOString(),
        }
      };
      
      logger.debug(`[ConversationContextInterceptor] Injected metadata for conversation: ${context.conversationId}`);
    } catch (error) {
      logger.error(`[ConversationContextInterceptor] Error injecting conversation context`, error);
    }

    return next();
  }

  private shouldInjectContext(context: MCPToolCallContext): boolean {
    // Check if tool explicitly requests conversation history
    // or matches certain patterns
    const needsContext = [
      'summarize',
      'analyze_conversation',
      'extract_topics',
      'sentiment_analysis'
    ];
    
    return needsContext.some(pattern => 
      context.toolName.toLowerCase().includes(pattern)
    );
  }
}