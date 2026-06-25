import type { Agents, TToolApprovalPolicy } from 'librechat-data-provider';
import {
  isHITLEnabled,
  mapToolApprovalPolicy,
  buildToolApprovalPayload,
  buildAskUserQuestionPayload,
  buildPendingAction,
  computeAgentRequestFingerprint,
  pickResumeContext,
  applyResumeContext,
} from './policy';

describe('isHITLEnabled', () => {
  test('default-off when no policy configured', () => {
    expect(isHITLEnabled(undefined)).toBe(false);
  });

  test('default-off when policy is configured but `enabled` is omitted', () => {
    expect(isHITLEnabled({})).toBe(false);
    expect(isHITLEnabled({ mode: 'default', allow: ['read_*'] })).toBe(false);
  });

  test('explicit false is off', () => {
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

  test('carries tool_call_id on each review_config (join key for duplicate-tool batches)', () => {
    const payload = buildToolApprovalPayload([
      { name: 'mcp:server:search', arguments: { q: 'a' }, tool_call_id: 'call_1' },
      { name: 'mcp:server:search', arguments: { q: 'b' }, tool_call_id: 'call_2' },
    ]);
    expect(payload.review_configs).toEqual([
      {
        action_name: 'mcp:server:search',
        tool_call_id: 'call_1',
        allowed_decisions: ['approve', 'reject', 'edit'],
      },
      {
        action_name: 'mcp:server:search',
        tool_call_id: 'call_2',
        allowed_decisions: ['approve', 'reject', 'edit'],
      },
    ]);
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
    review_configs: [
      { action_name: 'shell', tool_call_id: 'call_abc', allowed_decisions: ['approve', 'reject'] },
    ],
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

  test('honours ttlMs 0 as immediate expiry', () => {
    const before = Date.now();
    const action = buildPendingAction(toolApprovalPayload, { ...ctx, ttlMs: 0 });
    const after = Date.now();

    expect(action.expiresAt).toBeDefined();
    expect(action.expiresAt).toBeGreaterThanOrEqual(before);
    expect(action.expiresAt).toBeLessThanOrEqual(after);
  });
});

describe('computeAgentRequestFingerprint', () => {
  it('is stable for the same graph-determining fields (ignoring other body keys)', () => {
    const a = computeAgentRequestFingerprint({
      endpoint: 'agents',
      agent_id: 'agent-1',
      model: 'gpt',
    });
    // Extra/unknown fields on the body must not change the fingerprint.
    const b = computeAgentRequestFingerprint({
      endpoint: 'agents',
      agent_id: 'agent-1',
      model: 'gpt',
      ...({ conversationId: 'c', decisions: [] } as Record<string, unknown>),
    });
    expect(a).toBe(b);
  });

  it('differs when a graph-determining field changes', () => {
    const base = { endpoint: 'agents', agent_id: 'agent-1', model: 'gpt' };
    expect(computeAgentRequestFingerprint(base)).not.toBe(
      computeAgentRequestFingerprint({ ...base, model: 'other' }),
    );
    expect(computeAgentRequestFingerprint(base)).not.toBe(
      computeAgentRequestFingerprint({ ...base, agent_id: 'agent-2' }),
    );
  });

  it('differs when promptPrefix changes (ephemeral instructions)', () => {
    const base = { endpoint: 'agents', promptPrefix: 'be terse' };
    expect(computeAgentRequestFingerprint(base)).not.toBe(
      computeAgentRequestFingerprint({ ...base, promptPrefix: 'be verbose' }),
    );
    // null vs absent are treated the same
    expect(computeAgentRequestFingerprint({ endpoint: 'agents' })).toBe(
      computeAgentRequestFingerprint({ endpoint: 'agents', promptPrefix: null }),
    );
  });

  it('normalizes ephemeralAgent so key/array order does not matter', () => {
    const x = computeAgentRequestFingerprint({
      endpoint: 'agents',
      ephemeralAgent: { mcp: ['b', 'a'], execute_code: true },
    });
    const y = computeAgentRequestFingerprint({
      endpoint: 'agents',
      ephemeralAgent: { execute_code: true, mcp: ['a', 'b'] },
    });
    expect(x).toBe(y);
  });

  it('distinguishes a different ephemeral capability set (the swap it guards against)', () => {
    const a = computeAgentRequestFingerprint({
      endpoint: 'agents',
      ephemeralAgent: { execute_code: true },
    });
    const b = computeAgentRequestFingerprint({
      endpoint: 'agents',
      ephemeralAgent: { execute_code: false, mcp: ['evil'] },
    });
    expect(a).not.toBe(b);
  });
});

describe('pickResumeContext / applyResumeContext', () => {
  it('picks only the graph-determining fields, dropping unrelated body keys', () => {
    const ctx = pickResumeContext({
      endpoint: 'agents',
      agent_id: 'a1',
      model: 'gpt',
      promptPrefix: 'be terse',
      ephemeralAgent: { execute_code: true },
      conversationId: 'c',
      decisions: [],
      actionId: 'x',
    });
    expect(ctx).toEqual({
      endpoint: 'agents',
      agent_id: 'a1',
      model: 'gpt',
      promptPrefix: 'be terse',
      ephemeralAgent: { execute_code: true },
    });
  });

  it('omits absent (undefined) fields but keeps explicit null', () => {
    const ctx = pickResumeContext({ endpoint: 'agents', ephemeralAgent: null });
    expect(ctx).toEqual({ endpoint: 'agents', ephemeralAgent: null });
    expect('agent_id' in ctx).toBe(false);
  });

  it('replays the persisted context onto a body, overwriting what the client sent', () => {
    // The reload case: the client lost ephemeralAgent (null); the server restores it.
    const body: Record<string, unknown> = {
      conversationId: 'c',
      actionId: 'x',
      ephemeralAgent: null,
      promptPrefix: 'tampered',
    };
    applyResumeContext(body, {
      endpoint: 'agents',
      ephemeralAgent: { execute_code: true, mcp: ['srv'] },
      promptPrefix: 'original',
    });
    expect(body.ephemeralAgent).toEqual({ execute_code: true, mcp: ['srv'] });
    expect(body.promptPrefix).toBe('original');
    expect(body.endpoint).toBe('agents');
    // Non-context fields are untouched.
    expect(body.conversationId).toBe('c');
    expect(body.actionId).toBe('x');
  });

  it('is a no-op for a null/undefined context', () => {
    const body: Record<string, unknown> = { ephemeralAgent: null };
    applyResumeContext(body, undefined);
    expect(body.ephemeralAgent).toBeNull();
  });

  it('round-trips through buildPendingAction so replay restores the original body', () => {
    const original = { endpoint: 'agents', ephemeralAgent: { execute_code: true }, promptPrefix: 'p' };
    const action = buildPendingAction(
      { type: 'ask_user_question', question: { question: 'q' } } as Agents.HumanInterruptPayload,
      { streamId: 's', resumeContext: pickResumeContext(original) },
    );
    const reloadedBody: Record<string, unknown> = { ephemeralAgent: null };
    applyResumeContext(reloadedBody, action.resumeContext);
    expect(reloadedBody.ephemeralAgent).toEqual({ execute_code: true });
    expect(reloadedBody.promptPrefix).toBe('p');
  });
});
