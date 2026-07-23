import { HookRegistry, executeHooks } from '@librechat/agents';
import type { HookOutput } from '@librechat/agents';
import type { PluginHookCapabilities } from './compatibility';
import type { PluginHookExecutor } from './runtime';
import type { PluginHooksDocument } from './schema';
import { registerPluginHooks } from './runtime';

const commandCapabilities: PluginHookCapabilities = {
  handlerTypes: new Set(['command']),
  translateMatcher: ({ matcher }: { matcher: string }) => matcher,
};

function document(hooks: PluginHooksDocument['hooks']): PluginHooksDocument {
  return { hooks };
}

function executor(output: HookOutput = {}): PluginHookExecutor & {
  execute: jest.Mock<Promise<HookOutput>, Parameters<PluginHookExecutor['execute']>>;
} {
  const execute = jest.fn<Promise<HookOutput>, Parameters<PluginHookExecutor['execute']>>(
    async (_request, _signal) => output,
  );
  return {
    capabilities: commandCapabilities,
    execute,
  };
}

describe('registerPluginHooks', () => {
  test('registers a supported command hook and passes a Claude-shaped payload', async () => {
    const registry = new HookRegistry();
    const hookExecutor = executor({
      decision: 'deny',
      reason: 'Protected path',
      additionalContext: 'Policy checked',
    });
    hookExecutor.capabilities.conditions = true;
    const registration = registerPluginHooks({
      pluginId: 'security-guidance',
      registry,
      executor: hookExecutor,
      context: {
        sessionId: 'conversation-1',
        cwd: '/workspace',
        permissionMode: 'default',
      },
      document: document({
        PreToolUse: [
          {
            matcher: '^write_file$',
            hooks: [
              {
                type: 'command',
                command: 'check-write',
                if: 'Write(/workspace/**)',
                timeout: 5,
              },
            ],
          },
        ],
      }),
    });

    const result = await executeHooks({
      registry,
      matchQuery: 'write_file',
      input: {
        hook_event_name: 'PreToolUse',
        runId: 'run-1',
        threadId: 'thread-1',
        agentId: 'agent-1',
        toolName: 'write_file',
        toolInput: { path: '/workspace/file.ts' },
        toolUseId: 'tool-1',
      },
    });

    expect(registration.registered).toBe(1);
    expect(registry.getMatchers('PreToolUse')[0].timeout).toBe(5_000);
    expect(result).toEqual(
      expect.objectContaining({
        decision: 'deny',
        reason: 'Protected path',
        additionalContexts: ['Policy checked'],
      }),
    );
    expect(hookExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: 'security-guidance',
        sourceEvent: 'PreToolUse',
        targetEvent: 'PreToolUse',
        condition: 'Write(/workspace/**)',
        payload: expect.objectContaining({
          hook_event_name: 'PreToolUse',
          session_id: 'conversation-1',
          run_id: 'run-1',
          thread_id: 'thread-1',
          cwd: '/workspace',
          permission_mode: 'default',
          agent_id: 'agent-1',
          tool_name: 'write_file',
          tool_input: { path: '/workspace/file.ts' },
          tool_use_id: 'tool-1',
        }),
      }),
      expect.any(AbortSignal),
    );
  });

  test('preserves SessionStart as the source event while registering RunStart', async () => {
    const registry = new HookRegistry();
    const hookExecutor = executor({ additionalContext: 'Loaded project context' });
    hookExecutor.capabilities.sessionLifecycle = true;
    registerPluginHooks({
      pluginId: 'learning-output-style',
      registry,
      executor: hookExecutor,
      context: { sessionStartSource: 'resume' },
      document: document({
        SessionStart: [
          {
            matcher: '*',
            hooks: [{ type: 'command', command: 'load-context' }],
          },
        ],
      }),
    });

    const result = await executeHooks({
      registry,
      input: {
        hook_event_name: 'RunStart',
        runId: 'run-2',
        threadId: 'conversation-2',
        messages: [],
      },
    });

    expect(result.additionalContexts).toEqual(['Loaded project context']);
    expect(hookExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceEvent: 'SessionStart',
        targetEvent: 'RunStart',
        payload: expect.objectContaining({
          hook_event_name: 'SessionStart',
          session_id: 'conversation-2',
          source: 'resume',
        }),
      }),
      expect.any(AbortSignal),
    );
  });

  test('registers the event surface used by the official hookify plugin', () => {
    const registry = new HookRegistry();
    const registration = registerPluginHooks({
      pluginId: 'hookify',
      registry,
      executor: executor(),
      document: document({
        PreToolUse: [{ hooks: [{ type: 'command', command: 'pretooluse.py' }] }],
        PostToolUse: [{ hooks: [{ type: 'command', command: 'posttooluse.py' }] }],
        Stop: [{ hooks: [{ type: 'command', command: 'stop.py' }] }],
        UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'userpromptsubmit.py' }] }],
      }),
    });

    expect(registration.registered).toBe(4);
    expect(registration.plan.summary).toEqual({ declared: 4, ready: 4, unsupported: 0 });
    expect(registry.getMatchers('PreToolUse')).toHaveLength(1);
    expect(registry.getMatchers('PostToolUse')).toHaveLength(1);
    expect(registry.getMatchers('Stop')).toHaveLength(1);
    expect(registry.getMatchers('UserPromptSubmit')).toHaveLength(1);
  });

  test('leaves unsupported declarations in the plan without registering them', () => {
    const registry = new HookRegistry();
    const registration = registerPluginHooks({
      pluginId: 'mixed-plugin',
      registry,
      executor: executor(),
      document: document({
        UserPromptExpansion: [{ hooks: [{ type: 'command', command: 'banner' }] }],
        Stop: [{ hooks: [{ type: 'prompt', prompt: 'Verify completion' }] }],
      }),
    });

    expect(registration.registered).toBe(0);
    expect(registration.plan.summary.unsupported).toBe(2);
    expect(registry.getMatchers('Stop')).toHaveLength(0);
  });

  test('unregisters only this plugin registration and is idempotent', () => {
    const registry = new HookRegistry();
    const existing = jest.fn(async () => ({}));
    registry.register('Stop', { hooks: [existing] });
    const registration = registerPluginHooks({
      pluginId: 'ralph-loop',
      registry,
      executor: executor(),
      document: document({
        Stop: [{ hooks: [{ type: 'command', command: 'stop-hook.sh' }] }],
      }),
    });

    expect(registry.getMatchers('Stop')).toHaveLength(2);
    registration.unregister();
    registration.unregister();
    expect(registry.getMatchers('Stop')).toHaveLength(1);
    expect(registry.getMatchers('Stop')[0].hooks[0]).toBe(existing);
  });
});
