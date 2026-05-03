import type { Agents, TToolApprovalPolicy } from 'librechat-data-provider';
import {
  isHITLEnabled,
  mapToolApprovalPolicy,
  buildToolApprovalPayload,
  buildAskUserQuestionPayload,
  buildPendingAction,
} from './policy';

describe('isHITLEnabled', () => {
  test('default-on when no policy configured (SDK default)', () => {
    expect(isHITLEnabled(undefined)).toBe(true);
  });

  test('default-on when policy is configured but `enabled` is omitted', () => {
    expect(isHITLEnabled({})).toBe(true);
    expect(isHITLEnabled({ mode: 'default', allow: ['read_*'] })).toBe(true);
  });

  test('explicit false is the only off signal', () => {
    expect(isHITLEnabled({ enabled: false })).toBe(false);
  });

  test('explicit true is on', () => {
    expect(isHITLEnabled({ enabled: true })).toBe(true);
  });
});

describe('mapToolApprovalPolicy', () => {
  test('returns undefined when no policy is configured', () => {
    expect(mapToolApprovalPolicy(undefined)).toBeUndefined();
  });

  test('returns undefined when policy is empty after stripping enabled', () => {
    expect(mapToolApprovalPolicy({ enabled: true })).toBeUndefined();
    expect(mapToolApprovalPolicy({ enabled: false })).toBeUndefined();
  });

  test('returns undefined when only empty arrays are present', () => {
    expect(mapToolApprovalPolicy({ allow: [], deny: [], ask: [] })).toBeUndefined();
  });

  test('passes through mode/allow/deny/ask/reason verbatim', () => {
    const policy: TToolApprovalPolicy = {
      mode: 'dontAsk',
      allow: ['read_*', 'mcp:github:*'],
      deny: ['delete_*'],
      ask: ['execute_*'],
      reason: 'Tool {tool} requires review',
    };
    expect(mapToolApprovalPolicy(policy)).toEqual({
      mode: 'dontAsk',
      allow: ['read_*', 'mcp:github:*'],
      deny: ['delete_*'],
      ask: ['execute_*'],
      reason: 'Tool {tool} requires review',
    });
  });

  test('strips enabled regardless of value (LibreChat-only field)', () => {
    expect(mapToolApprovalPolicy({ enabled: false, mode: 'bypass' })).toEqual({
      mode: 'bypass',
    });
    expect(mapToolApprovalPolicy({ enabled: true, allow: ['read_*'] })).toEqual({
      allow: ['read_*'],
    });
  });

  test('omits empty list fields from the output', () => {
    expect(mapToolApprovalPolicy({ mode: 'default', allow: [], deny: ['rm'] })).toEqual({
      mode: 'default',
      deny: ['rm'],
    });
  });
});

describe('buildToolApprovalPayload', () => {
  const calls = [
    {
      name: 'shell',
      arguments: { command: 'ls' },
      tool_call_id: 'call_abc',
      description: 'List files',
    },
  ];

  test('produces a tool_approval-discriminated payload', () => {
    const payload = buildToolApprovalPayload(calls);
    expect(payload.type).toBe('tool_approval');
    expect(payload.action_requests).toEqual([
      {
        name: 'shell',
        arguments: { command: 'ls' },
        tool_call_id: 'call_abc',
        description: 'List files',
      },
    ]);
  });

  test("default decisions exclude 'respond' (reserved for AskUserQuestion semantics)", () => {
    const payload = buildToolApprovalPayload(calls);
    expect(payload.review_configs[0].allowed_decisions).toEqual(['approve', 'reject', 'edit']);
  });

  test('respects per-tool decision overrides', () => {
    const payload = buildToolApprovalPayload(calls, {
      shell: ['approve', 'reject'],
    });
    expect(payload.review_configs[0].allowed_decisions).toEqual(['approve', 'reject']);
  });

  test('produces one review_config per call, in order', () => {
    const payload = buildToolApprovalPayload([
      { name: 'a', arguments: {}, tool_call_id: '1' },
      { name: 'b', arguments: {}, tool_call_id: '2' },
    ]);
    expect(payload.review_configs.map((r) => r.action_name)).toEqual(['a', 'b']);
  });
});

describe('buildAskUserQuestionPayload', () => {
  test('produces an ask_user_question-discriminated payload', () => {
    const payload = buildAskUserQuestionPayload({
      question: 'Which environment?',
      options: [
        { label: 'Staging', value: 'staging' },
        { label: 'Production', value: 'production' },
      ],
    });
    expect(payload.type).toBe('ask_user_question');
    expect(payload.question.question).toBe('Which environment?');
    expect(payload.question.options).toHaveLength(2);
  });

  test('options are optional', () => {
    const payload = buildAskUserQuestionPayload({ question: 'Free-form?' });
    expect(payload.question.options).toBeUndefined();
  });
});

describe('buildPendingAction', () => {
  const ctx = {
    streamId: 'stream-1',
    conversationId: 'conv-1',
    runId: 'run-1',
    responseMessageId: 'msg-1',
  };

  const toolApprovalPayload: Agents.ToolApprovalInterruptPayload = {
    type: 'tool_approval',
    action_requests: [{ name: 'shell', arguments: { command: 'ls' }, tool_call_id: 'call_abc' }],
    review_configs: [{ action_name: 'shell', allowed_decisions: ['approve', 'reject'] }],
  };

  test('wraps a tool_approval payload with job context', () => {
    const action = buildPendingAction(toolApprovalPayload, ctx);
    expect(action.streamId).toBe('stream-1');
    expect(action.conversationId).toBe('conv-1');
    expect(action.runId).toBe('run-1');
    expect(action.responseMessageId).toBe('msg-1');
    expect(action.payload).toBe(toolApprovalPayload);
    expect(typeof action.createdAt).toBe('number');
  });

  test('wraps an ask_user_question payload with the same envelope', () => {
    const askPayload: Agents.AskUserQuestionInterruptPayload = {
      type: 'ask_user_question',
      question: { question: 'Which env?' },
    };
    const action = buildPendingAction(askPayload, ctx);
    expect(action.payload.type).toBe('ask_user_question');
  });

  test('generates a uuid actionId by default', () => {
    const a = buildPendingAction(toolApprovalPayload, ctx);
    const b = buildPendingAction(toolApprovalPayload, ctx);
    expect(a.actionId).not.toBe(b.actionId);
    expect(a.actionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  test('honours an explicit actionId', () => {
    const action = buildPendingAction(toolApprovalPayload, { ...ctx, actionId: 'fixed-id' });
    expect(action.actionId).toBe('fixed-id');
  });

  test('sets expiresAt only when ttlMs is provided', () => {
    const without = buildPendingAction(toolApprovalPayload, ctx);
    expect(without.expiresAt).toBeUndefined();

    const ttl = 5_000;
    const before = Date.now();
    const withTtl = buildPendingAction(toolApprovalPayload, { ...ctx, ttlMs: ttl });
    const after = Date.now();
    expect(withTtl.expiresAt).toBeDefined();
    expect(withTtl.expiresAt).toBeGreaterThanOrEqual(before + ttl);
    expect(withTtl.expiresAt).toBeLessThanOrEqual(after + ttl);
  });
});
