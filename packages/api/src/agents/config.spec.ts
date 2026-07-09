import type { TAgentsEndpoint } from 'librechat-data-provider';
import { resolveRecursionLimit, resolveSubagentMaxTurns } from './config';

describe('resolveRecursionLimit', () => {
  it('returns default 50 when no config or agent provided', () => {
    expect(resolveRecursionLimit(undefined, undefined)).toBe(50);
  });

  it('returns default 50 when config has no recursionLimit', () => {
    expect(resolveRecursionLimit({} as TAgentsEndpoint, {})).toBe(50);
  });

  it('uses yaml recursionLimit when set', () => {
    const config = { recursionLimit: 100 } as TAgentsEndpoint;
    expect(resolveRecursionLimit(config, {})).toBe(100);
  });

  it('overrides with agent.recursion_limit when set', () => {
    const config = { recursionLimit: 100 } as TAgentsEndpoint;
    expect(resolveRecursionLimit(config, { recursion_limit: 200 })).toBe(200);
  });

  it('caps at maxRecursionLimit', () => {
    const config = { recursionLimit: 100, maxRecursionLimit: 150 } as TAgentsEndpoint;
    expect(resolveRecursionLimit(config, { recursion_limit: 200 })).toBe(150);
  });

  it('caps yaml default at maxRecursionLimit', () => {
    const config = { recursionLimit: 200, maxRecursionLimit: 100 } as TAgentsEndpoint;
    expect(resolveRecursionLimit(config, {})).toBe(100);
  });

  it('ignores agent.recursion_limit of 0', () => {
    const config = { recursionLimit: 100 } as TAgentsEndpoint;
    expect(resolveRecursionLimit(config, { recursion_limit: 0 })).toBe(100);
  });

  it('ignores negative agent.recursion_limit', () => {
    const config = { recursionLimit: 100 } as TAgentsEndpoint;
    expect(resolveRecursionLimit(config, { recursion_limit: -5 })).toBe(100);
  });

  it('ignores maxRecursionLimit of 0', () => {
    const config = { recursionLimit: 100, maxRecursionLimit: 0 } as TAgentsEndpoint;
    expect(resolveRecursionLimit(config, { recursion_limit: 200 })).toBe(200);
  });

  it('does not cap when recursionLimit is within maxRecursionLimit', () => {
    const config = { recursionLimit: 50, maxRecursionLimit: 200 } as TAgentsEndpoint;
    expect(resolveRecursionLimit(config, { recursion_limit: 150 })).toBe(150);
  });

  it('allows agent to override downward below yaml default', () => {
    const config = { recursionLimit: 100 } as TAgentsEndpoint;
    expect(resolveRecursionLimit(config, { recursion_limit: 30 })).toBe(30);
  });

  it('does not cap when agent.recursion_limit equals maxRecursionLimit', () => {
    const config = { recursionLimit: 50, maxRecursionLimit: 150 } as TAgentsEndpoint;
    expect(resolveRecursionLimit(config, { recursion_limit: 150 })).toBe(150);
  });
});

describe('resolveSubagentMaxTurns', () => {
  it('floors at the SDK default (25 turns / 75 graph steps) with no config', () => {
    expect(resolveSubagentMaxTurns(undefined, undefined)).toBe(25);
  });

  it('floors at 25 when the resolved limit divided by 3 is below the default', () => {
    const config = { recursionLimit: 50 } as TAgentsEndpoint;
    expect(resolveSubagentMaxTurns(config, {})).toBe(25);
  });

  it('derives maxTurns from the per-agent recursion_limit so the graph limit tracks it', () => {
    const config = { recursionLimit: 50, maxRecursionLimit: 1000 } as TAgentsEndpoint;
    expect(resolveSubagentMaxTurns(config, { recursion_limit: 500 })).toBe(167);
  });

  it('derives maxTurns from the yaml recursionLimit default', () => {
    const config = { recursionLimit: 300 } as TAgentsEndpoint;
    expect(resolveSubagentMaxTurns(config, {})).toBe(100);
  });

  it('respects maxRecursionLimit when capping the resolved limit', () => {
    const config = { recursionLimit: 100, maxRecursionLimit: 150 } as TAgentsEndpoint;
    expect(resolveSubagentMaxTurns(config, { recursion_limit: 600 })).toBe(50);
  });

  it('rounds up so the derived graph limit is never below the resolved limit', () => {
    const config = { recursionLimit: 100 } as TAgentsEndpoint;
    expect(resolveSubagentMaxTurns(config, { recursion_limit: 200 })).toBe(67);
  });

  it('clamps the default floor so it never exceeds a small maxRecursionLimit', () => {
    const config = { maxRecursionLimit: 20 } as TAgentsEndpoint;
    const turns = resolveSubagentMaxTurns(config, {});
    expect(turns).toBe(6);
    expect(turns * 3).toBeLessThanOrEqual(20);
  });

  it('clamps ceil overshoot so it never exceeds maxRecursionLimit', () => {
    const config = { recursionLimit: 200, maxRecursionLimit: 200 } as TAgentsEndpoint;
    const turns = resolveSubagentMaxTurns(config, {});
    expect(turns).toBe(66);
    expect(turns * 3).toBeLessThanOrEqual(200);
  });

  it('keeps at least one turn when maxRecursionLimit is smaller than the multiplier', () => {
    const config = { maxRecursionLimit: 2 } as TAgentsEndpoint;
    expect(resolveSubagentMaxTurns(config, {})).toBe(1);
  });
});
