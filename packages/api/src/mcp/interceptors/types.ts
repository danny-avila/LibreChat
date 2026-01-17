import type { IUser } from '@librechat/data-schemas';

export interface MCPToolCallContext {
  conversationId?: string;
  userId?: string;
  messageId?: string;
  toolName: string;
  originalArgs: Record<string, any>;
  runtime: {
    user?: IUser;
    conversation?: any;
  };
}

export interface MCPInterceptor {
  name: string;
  priority: number; // Lower = runs first
  
  /**
   * Intercept and modify tool call before execution
   * @returns Modified args
   */
  intercept(
    context: MCPToolCallContext,
    next: () => Promise<Record<string, any>>
  ): Promise<Record<string, any>>;
}

export interface InterceptorConfig {
  enabled: boolean;
  interceptors: string[]; // Names of interceptors to enable
  options?: Record<string, any>;
}
