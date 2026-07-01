import { HookRegistry } from '@librechat/agents';
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
