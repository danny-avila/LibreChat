import { HookRegistry } from '@librechat/agents';
import { registerToolApprovalHook, clearToolApprovalHooks } from './hooks';
import { buildHITLRunWiring } from './runtime';

describe('buildHITLRunWiring', () => {
  test('returns undefined when HITL is disabled (the default)', () => {
    expect(buildHITLRunWiring(undefined)).toBeUndefined();
    expect(buildHITLRunWiring({})).toBeUndefined();
    expect(buildHITLRunWiring({ enabled: false })).toBeUndefined();
    expect(buildHITLRunWiring({ mode: 'default', allow: ['read_*'] })).toBeUndefined();
  });

  test('returns the run wiring when enabled', () => {
    const wiring = buildHITLRunWiring({ enabled: true });
    expect(wiring).toBeDefined();
    expect(wiring?.humanInTheLoop).toEqual({ enabled: true });
    expect(wiring?.hooks).toBeInstanceOf(HookRegistry);
  });

  test('registers exactly one PreToolUse policy hook', () => {
    const wiring = buildHITLRunWiring({ enabled: true, mode: 'bypass', allow: ['x'] });
    const matchers = wiring?.hooks.getMatchers('PreToolUse') ?? [];
    expect(matchers).toHaveLength(1);
  });

  test('an enabled policy with no lists still wires (every tool falls through to ask)', () => {
    const wiring = buildHITLRunWiring({ enabled: true });
    expect(wiring?.hooks.getMatchers('PreToolUse')).toHaveLength(1);
  });
});

describe('buildHITLRunWiring host-hook composition', () => {
  afterEach(() => clearToolApprovalHooks());

  test('registers the static policy hook PLUS each registered host hook', () => {
    registerToolApprovalHook(() => async () => ({ decision: 'deny' }));
    registerToolApprovalHook(() => async () => ({ decision: 'ask' }), { matcher: 'write_.*' });
    const wiring = buildHITLRunWiring({ enabled: true });
    // 1 static baseline + 2 host hooks
    expect(wiring?.hooks.getMatchers('PreToolUse')).toHaveLength(3);
  });

  test('a factory that opts out (returns undefined) is not registered', () => {
    registerToolApprovalHook(() => undefined);
    const wiring = buildHITLRunWiring({ enabled: true });
    expect(wiring?.hooks.getMatchers('PreToolUse')).toHaveLength(1); // only the static baseline
  });

  test('does not invoke host-hook factories when HITL is disabled', () => {
    const factory = jest.fn(() => undefined);
    registerToolApprovalHook(factory);
    expect(buildHITLRunWiring({ enabled: false })).toBeUndefined();
    expect(factory).not.toHaveBeenCalled();
  });

  test('passes the run context to each factory', () => {
    const factory = jest.fn(() => undefined);
    registerToolApprovalHook(factory);
    buildHITLRunWiring({ enabled: true }, { userId: 'u1', conversationId: 'c1' });
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', conversationId: 'c1' }),
    );
  });
});
