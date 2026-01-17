import { MCPInterceptor, MCPToolCallContext } from './types';
// @ts-ignore
import { getMessages } from '~/models/Message';

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

    // Fetch conversation history from MongoDB
    const messages = await getMessages({
      conversationId: context.conversationId
    });

    // Format messages for MCP tool
    const conversationHistory = messages.slice(-(this.options.maxMessages || 50)).map((msg: any) => ({
      role: msg.isCreatedByUser ? 'user' : 'assistant',
      content: msg.text,
      timestamp: msg.createdAt
    }));

    // Inject into tool arguments
    context.originalArgs = {
      ...context.originalArgs,
      _conversation_history: conversationHistory,
      _conversation_metadata: {
        conversationId: context.conversationId,
        messageCount: messages.length,
      }
    };

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
