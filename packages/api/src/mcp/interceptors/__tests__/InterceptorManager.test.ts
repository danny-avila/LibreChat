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
});
