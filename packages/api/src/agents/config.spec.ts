import type { TAgentsEndpoint } from 'librechat-data-provider';
import { resolveRecursionLimit } from './config';

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
