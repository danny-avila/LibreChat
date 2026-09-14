import { HumanMessage } from '@langchain/core/messages';
import { toolReviewerConfigSchema } from 'librechat-data-provider';
import { executeHooks, setProviderMessageProvenance } from '@librechat/agents';
import type { PreToolUseHookInput } from '@librechat/agents';
import { createAttachedCodeEnvironmentPolicyHook, resolveAttachedCodeApprovalMode } from './byom';
import { createAutoReviewer } from './reviewer';
import { buildHITLRunWiring } from './runtime';

function human(text: string) {
  const message = new HumanMessage(text);
  setProviderMessageProvenance(message, [{ attribution: 'user', sourceMessageId: 'user-request' }]);
  return message;
}
const config = toolReviewerConfigSchema.parse({ endpoint: 'openAI', model: 'reviewer' });
const input: PreToolUseHookInput = {
  hook_event_name: 'PreToolUse',
  runId: 'run',
  threadId: 'thread',
  executingAgentId: 'machine',
  toolName: 'bash_tool',
  toolUseId: 'call',
  toolInput: { command: 'git status' },
};
const signal = new AbortController().signal;
const settings = () =>
  new Map([
    [
      'machine',
      {
        configSchema: {
          permissions: {
            fileWrite: {
              allowed: ['ask', 'allow', 'deny'] as Array<'ask' | 'allow' | 'deny'>,
              default: 'ask' as const,
            },
            commandExecution: {
              allowed: ['ask', 'allow', 'deny'] as Array<'ask' | 'allow' | 'deny'>,
              default: 'ask' as const,
            },
          },
        },
      },
    ],
  ]);
const assessment = (outcome = 'allow', risk_level = 'low', user_authorization = 'high') =>
  JSON.stringify({ outcome, risk_level, user_authorization, rationale: 'Scoped to the request.' });
function reviewer(invoke = jest.fn().mockResolvedValue(assessment())) {
  return {
    invoke,
    reviewer: createAutoReviewer({
      config,
      messages: [human('Check git status.')],
      getModel: async () => ({ invoke }),
    }),
  };
}

describe('Auto review execution policy', () => {
  test.each(['allow', 'deny', 'ask'])('propagates a valid %s assessment', async (decision) => {
    const { reviewer: r, invoke } = reviewer(jest.fn().mockResolvedValue(assessment(decision)));
    expect(await r.review(input, signal)).toMatchObject({ decision });
    expect(invoke.mock.calls[0][0]).toContain('Check git status.');
    expect(invoke.mock.calls[0][0]).toContain('git status');
  });
  test.each(['not json', '{"outcome":"allow"}', assessment('allow', 'invalid')])(
    'asks on invalid output %s',
    async (text) => {
      const { reviewer: r } = reviewer(jest.fn().mockResolvedValue(text));
      expect(await r.review(input, signal)).toMatchObject({ decision: 'ask' });
    },
  );
  test('enforces critical and high-risk thresholds independently of model outcome', async () => {
    for (const [risk, authorization, expected] of [
      ['critical', 'high', 'deny'],
      ['high', 'low', 'ask'],
    ]) {
      const { reviewer: r } = reviewer(
        jest.fn().mockResolvedValue(assessment('allow', risk, authorization)),
      );
      expect(await r.review(input, signal)).toMatchObject({ decision: expected });
    }
  });
  test('does not retry inference failures', async () => {
    const { reviewer: r, invoke } = reviewer(jest.fn().mockRejectedValue(new Error('429')));
    expect(await r.review(input, signal)).toMatchObject({ decision: 'ask' });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  test('asks if timed out even when the provider ignores cancellation', async () => {
    jest.useFakeTimers();
    try {
      const { reviewer: r } = reviewer(jest.fn(() => new Promise(() => {})));
      const result = r.review(input, signal);
      await jest.advanceTimersByTimeAsync(config.timeoutMs);
      expect(await result).toMatchObject({ decision: 'ask' });
    } finally {
      jest.useRealTimers();
    }
  });
  test('uses restored checkpoint messages for a new post-resume action', async () => {
    let messages: HumanMessage[] = [];
    const invoke = jest.fn().mockResolvedValue(assessment());
    const r = createAutoReviewer({
      config,
      messages: () => messages,
      getModel: async () => ({ invoke }),
    });
    expect(await r.review(input, signal)).toMatchObject({ decision: 'ask' });
    messages = [human('Check git status.')];
    expect(await r.review(input, signal)).toMatchObject({ decision: 'allow' });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  test('fails closed if checkpoint message access fails', async () => {
    const r = createAutoReviewer({
      config,
      messages: () => {
        throw new Error('checkpoint unavailable');
      },
      getModel: jest.fn(),
    });
    expect(await r.review(input, signal)).toMatchObject({ decision: 'ask' });
  });
  test('returns ask before the SDK hook deadline at the maximum reviewer timeout', async () => {
    jest.useFakeTimers();
    try {
      const timeoutMs = 120000;
      const r = createAutoReviewer({
        config: { ...config, timeoutMs },
        messages: [human('Check git status.')],
        getModel: async () => ({ invoke: () => new Promise(() => {}) }),
      });
      const wiring = buildHITLRunWiring(
        { enabled: true, mode: 'bypass' },
        {},
        [],
        [{ hook: r.review, timeout: timeoutMs + 5000 }],
      )!;
      const result = executeHooks({
        registry: wiring.hooks,
        input,
        sessionId: 'run',
        matchQuery: 'bash_tool',
      });
      await jest.advanceTimersByTimeAsync(timeoutMs);
      const decision = await result;
      expect(decision.decision).toBe('ask');
      expect(decision.hasHookFailures).not.toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
  test('does not call inference without authorization, after steering, or for oversized input', async () => {
    const { reviewer: r, invoke } = reviewer();
    r.invalidate();
    expect(await r.review(input, signal)).toMatchObject({ decision: 'ask' });
    const noHistory = createAutoReviewer({
      config,
      messages: [],
      getModel: async () => ({ invoke }),
    });
    expect(await noHistory.review(input, signal)).toMatchObject({ decision: 'ask' });
    expect(
      await reviewer(invoke).reviewer.review(
        { ...input, toolInput: { command: 'x'.repeat(config.maxInputChars) } },
        signal,
      ),
    ).toMatchObject({ decision: 'ask' });
    expect(invoke).not.toHaveBeenCalled();
  });
  test('requires configured reviewer and machine permission at admission', () => {
    expect(() => resolveAttachedCodeApprovalMode('auto', settings())).toThrow('not permitted');
    expect(resolveAttachedCodeApprovalMode('auto', settings(), true, true)).toBe('auto');
    expect(() => resolveAttachedCodeApprovalMode('auto', new Map(), true, true)).toThrow(
      'not permitted',
    );
  });
  test('rechecks machine policy and preserves persistent-skill review', async () => {
    const machines = settings();
    const { reviewer: r, invoke } = reviewer();
    const hook = createAttachedCodeEnvironmentPolicyHook(new Set(['machine']), machines, 'auto', r);
    expect(await hook(input, signal)).toMatchObject({ decision: 'allow' });
    machines.get('machine')!.configSchema.permissions.commandExecution.allowed = ['ask'];
    expect(await hook(input, signal)).toMatchObject({ decision: 'ask' });
    expect(
      await hook(
        { ...input, toolName: 'create_file', toolInput: { path: 'skills/test/SKILL.md' } },
        signal,
      ),
    ).toMatchObject({ decision: 'ask' });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  test.each(['ask', 'deny'] as const)(
    'static %s wins over an automatic allow',
    async (decision) => {
      const { reviewer: r } = reviewer();
      const wiring = buildHITLRunWiring(
        { enabled: true, mode: 'bypass', [decision]: ['bash_tool'] },
        {},
        [],
        [
          {
            hook: createAttachedCodeEnvironmentPolicyHook(
              new Set(['machine']),
              settings(),
              'auto',
              r,
            ),
          },
        ],
      )!;
      const result = await executeHooks({
        registry: wiring.hooks,
        input,
        sessionId: 'run',
        matchQuery: 'bash_tool',
      });
      expect(result.decision).toBe(decision);
    },
  );
});
