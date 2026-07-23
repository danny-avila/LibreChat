import type { PluginHookCapabilities } from './compatibility';
import type { PluginHooksDocument } from './schema';
import { planPluginHooks } from './compatibility';

const commandCapabilities: PluginHookCapabilities = {
  handlerTypes: new Set(['command']),
  translateMatcher: ({ matcher }: { matcher: string }) => matcher,
};

function document(hooks: PluginHooksDocument['hooks']): PluginHooksDocument {
  return { hooks };
}

describe('planPluginHooks', () => {
  test('maps the common Claude lifecycle events directly', () => {
    const plan = planPluginHooks(
      document({
        PreToolUse: [{ matcher: '^write_file$', hooks: [{ type: 'command', command: 'check' }] }],
        PostToolUse: [{ hooks: [{ type: 'command', command: 'record' }] }],
        Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'verify' }] }],
      }),
      commandCapabilities,
    );

    expect(plan.summary).toEqual({ declared: 3, ready: 3, unsupported: 0 });
    expect(
      plan.entries.map(({ sourceEvent, targetEvent, matcher }) => ({
        sourceEvent,
        targetEvent,
        matcher,
      })),
    ).toEqual([
      { sourceEvent: 'PreToolUse', targetEvent: 'PreToolUse', matcher: '^write_file$' },
      { sourceEvent: 'PostToolUse', targetEvent: 'PostToolUse', matcher: undefined },
      { sourceEvent: 'Stop', targetEvent: 'Stop', matcher: undefined },
    ]);
  });

  test('maps SessionStart to RunStart with an explicit lifecycle warning', () => {
    const plan = planPluginHooks(
      document({
        SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: 'load-context' }] }],
      }),
      { ...commandCapabilities, sessionLifecycle: true },
    );

    expect(plan.summary.ready).toBe(1);
    expect(plan.entries[0]).toEqual(
      expect.objectContaining({
        sourceEvent: 'SessionStart',
        targetEvent: 'RunStart',
        status: 'ready',
        issues: [
          expect.objectContaining({
            code: 'event_alias',
            severity: 'warning',
          }),
        ],
      }),
    );
  });

  test('does not silently activate events or handler types the runtime cannot execute', () => {
    const plan = planPluginHooks(
      document({
        UserPromptExpansion: [{ hooks: [{ type: 'command', command: 'banner' }] }],
        Stop: [{ hooks: [{ type: 'prompt', prompt: 'Verify completion' }] }],
      }),
      commandCapabilities,
    );

    expect(plan.summary).toEqual({ declared: 2, ready: 0, unsupported: 2 });
    expect(plan.entries[0].issues).toEqual([
      expect.objectContaining({ code: 'unsupported_event' }),
    ]);
    expect(plan.entries[1].issues).toEqual([
      expect.objectContaining({ code: 'unsupported_handler' }),
    ]);
  });

  test('rejects conditional, async-rewake, and unsafe matcher semantics by default', () => {
    const plan = planPluginHooks(
      document({
        RunStart: [
          {
            matcher: 'startup',
            hooks: [{ type: 'command', command: 'load' }],
          },
        ],
        PostToolUse: [
          {
            matcher: '(a+)+',
            hooks: [
              {
                type: 'command',
                command: 'review',
                if: 'Bash(git commit:*)',
                async: true,
                asyncRewake: true,
              },
            ],
          },
        ],
      }),
      commandCapabilities,
    );

    expect(plan.summary.unsupported).toBe(2);
    expect(plan.entries[0].issues).toEqual([
      expect.objectContaining({ code: 'unsupported_matcher' }),
    ]);
    expect(plan.entries[1].issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_matcher' }),
        expect.objectContaining({ code: 'unsupported_condition' }),
        expect.objectContaining({ code: 'unsupported_async' }),
        expect.objectContaining({ code: 'unsupported_async_rewake' }),
      ]),
    );
  });

  test('requires explicit matcher and session-lifecycle adapters', () => {
    const plan = planPluginHooks(
      document({
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'check' }] }],
        SessionStart: [{ hooks: [{ type: 'command', command: 'load' }] }],
      }),
      { handlerTypes: new Set(['command']) },
    );

    expect(plan.summary).toEqual({ declared: 2, ready: 0, unsupported: 2 });
    expect(plan.entries[0].issues).toEqual([expect.objectContaining({ code: 'unmapped_matcher' })]);
    expect(plan.entries[1].issues).toEqual([
      expect.objectContaining({ code: 'unsupported_session_lifecycle' }),
    ]);
  });

  test('records matcher translation without losing the source declaration', () => {
    const plan = planPluginHooks(
      document({
        PreToolUse: [{ matcher: ' Bash|Write ', hooks: [{ type: 'command', command: 'check' }] }],
      }),
      {
        handlerTypes: new Set(['command']),
        translateMatcher: () => '^(bash_tool|create_file)$',
      },
    );

    expect(plan.entries[0]).toEqual(
      expect.objectContaining({
        sourceMatcher: 'Bash|Write',
        matcher: '^(bash_tool|create_file)$',
        status: 'ready',
        issues: [expect.objectContaining({ code: 'matcher_translated', severity: 'warning' })],
      }),
    );
  });

  test('plans current handler-level conditions independently', () => {
    const plan = planPluginHooks(
      document({
        PostToolUse: [
          {
            matcher: 'Bash',
            hooks: [
              {
                type: 'command',
                command: 'review-commit',
                if: 'Bash(git commit:*)',
              },
              {
                type: 'command',
                command: 'record-all',
              },
            ],
          },
        ],
      }),
      {
        handlerTypes: new Set(['command']),
        translateMatcher: () => '^bash_tool$',
      },
    );

    expect(plan.summary).toEqual({ declared: 2, ready: 1, unsupported: 1 });
    expect(plan.entries[0]).toEqual(
      expect.objectContaining({
        condition: 'Bash(git commit:*)',
        status: 'unsupported',
        issues: expect.arrayContaining([
          expect.objectContaining({ code: 'unsupported_condition' }),
        ]),
      }),
    );
    expect(plan.entries[1]).toEqual(
      expect.objectContaining({
        status: 'ready',
      }),
    );
  });

  test('converts portable timeout seconds to the SDK timeout in milliseconds', () => {
    const plan = planPluginHooks(
      document({
        Stop: [{ hooks: [{ type: 'command', command: 'verify', timeout: 30 }] }],
      }),
      commandCapabilities,
    );

    expect(plan.entries[0].timeoutMs).toBe(30_000);
  });
});
