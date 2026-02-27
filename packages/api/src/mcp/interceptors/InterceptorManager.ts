import { logger } from '@librechat/data-schemas';
import { ConversationContextInterceptor } from './ConversationContextInterceptor';
import { MCPInterceptor, MCPToolCallContext, InterceptorConfig } from './types';

export class InterceptorManager {
  private interceptors: Map<string, MCPInterceptor> = new Map();
  private config: InterceptorConfig;

  constructor(config: InterceptorConfig) {
    this.config = config;
    this.registerDefaultInterceptors();
  }

  private registerDefaultInterceptors() {
    this.register(new ConversationContextInterceptor(this.config.options?.conversationContext));
  }

  register(interceptor: MCPInterceptor) {
    this.interceptors.set(interceptor.name, interceptor);
  }

  async executeInterceptors(
    context: MCPToolCallContext
  ): Promise<Record<string, any>> {
    if (!this.config.enabled) {
      return context.originalArgs;
    }

    const activeInterceptors = Array.from(this.interceptors.values())
      .filter(i => this.config.interceptors.includes(i.name))
      .sort((a, b) => a.priority - b.priority);

    let index = 0;
    const next = async (): Promise<Record<string, any>> => {
      if (index < activeInterceptors.length) {
        const interceptor = activeInterceptors[index++];
        try {
          return await interceptor.intercept(context, next);
        } catch (error) {
          logger.error(`[Interceptor:${interceptor.name}] Error:`, error);
          return next();
        }
      }
      return context.originalArgs;
    };

    return next();
  }
}
