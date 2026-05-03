import type { TToolApprovalPolicy } from 'librechat-data-provider';
import { decideToolApproval, requiresApproval, buildPendingAction } from './policy';

describe('decideToolApproval', () => {
  test('returns "allow" when no policy is configured', () => {
    expect(decideToolApproval(undefined, { name: 'shell' })).toBe('allow');
  });

  test('returns the configured default when no rule matches', () => {
    const policy: TToolApprovalPolicy = { default: 'ask' };
    expect(decideToolApproval(policy, { name: 'unmapped' })).toBe('ask');
  });

  test('falls back to "allow" when default is omitted', () => {
    const policy: TToolApprovalPolicy = { required: ['shell'] };
    expect(decideToolApproval(policy, { name: 'web_search' })).toBe('allow');
  });

  test('returns "ask" when tool is in required list', () => {
    const policy: TToolApprovalPolicy = { required: ['shell', 'execute_code'] };
    expect(decideToolApproval(policy, { name: 'execute_code' })).toBe('ask');
  });

  test('returns "allow" for tools in excluded list, even when default is "ask"', () => {
    const policy: TToolApprovalPolicy = { default: 'ask', excluded: ['web_search'] };
    expect(decideToolApproval(policy, { name: 'web_search' })).toBe('allow');
  });

  test('excluded wins over required when a tool appears in both (defensive)', () => {
    const policy: TToolApprovalPolicy = {
      default: 'allow',
      required: ['shell'],
      excluded: ['shell'],
    };
    expect(decideToolApproval(policy, { name: 'shell' })).toBe('allow');
  });

  test('returns the default when tool name is missing', () => {
    const policy: TToolApprovalPolicy = { default: 'ask', required: ['shell'] };
    expect(decideToolApproval(policy, {})).toBe('ask');
  });
});

describe('requiresApproval', () => {
  test('true only when decision is "ask"', () => {
    const policy: TToolApprovalPolicy = { required: ['shell'] };
    expect(requiresApproval(policy, { name: 'shell' })).toBe(true);
    expect(requiresApproval(policy, { name: 'web_search' })).toBe(false);
    expect(requiresApproval(undefined, { name: 'shell' })).toBe(false);
  });
});

describe('buildPendingAction', () => {
  const baseInput = {
    streamId: 'stream-1',
    conversationId: 'conv-1',
    runId: 'run-1',
    responseMessageId: 'msg-1',
    toolCalls: [
      {
        name: 'shell',
        arguments: { command: 'ls' },
        tool_call_id: 'call_abc',
        description: 'List files',
      },
    ],
  };

  test('produces a payload mirroring LangChain HumanInterrupt shape', () => {
    const action = buildPendingAction(baseInput);
    expect(action.payload.type).toBe('tool_approval');
    expect(action.payload.action_requests).toEqual([
      {
        name: 'shell',
        arguments: { command: 'ls' },
        tool_call_id: 'call_abc',
        description: 'List files',
      },
    ]);
    expect(action.payload.review_configs).toEqual([
      { action_name: 'shell', allowed_decisions: ['approve', 'reject', 'edit'] },
    ]);
  });

  test('respects per-tool decision overrides', () => {
    const action = buildPendingAction({
      ...baseInput,
      decisionsByToolName: { shell: ['approve', 'reject'] },
    });
    expect(action.payload.review_configs[0].allowed_decisions).toEqual(['approve', 'reject']);
  });

  test('generates a uuid actionId by default', () => {
    const a = buildPendingAction(baseInput);
    const b = buildPendingAction(baseInput);
    expect(a.actionId).not.toBe(b.actionId);
    expect(a.actionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  test('honours an explicit actionId', () => {
    const action = buildPendingAction({ ...baseInput, actionId: 'fixed-id' });
    expect(action.actionId).toBe('fixed-id');
  });

  test('sets expiresAt only when ttlMs is provided', () => {
    const without = buildPendingAction(baseInput);
    expect(without.expiresAt).toBeUndefined();

    const ttl = 5_000;
    const before = Date.now();
    const withTtl = buildPendingAction({ ...baseInput, ttlMs: ttl });
    const after = Date.now();
    expect(withTtl.expiresAt).toBeDefined();
    expect(withTtl.expiresAt).toBeGreaterThanOrEqual(before + ttl);
    expect(withTtl.expiresAt).toBeLessThanOrEqual(after + ttl);
  });

  test('preserves stream/conversation/run identifiers', () => {
    const action = buildPendingAction(baseInput);
    expect(action.streamId).toBe('stream-1');
    expect(action.conversationId).toBe('conv-1');
    expect(action.runId).toBe('run-1');
    expect(action.responseMessageId).toBe('msg-1');
  });
});
