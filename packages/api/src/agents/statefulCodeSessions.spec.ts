import { AgentCapabilities } from 'librechat-data-provider';
import { resolveStatefulCodeSessions } from './run';

describe('resolveStatefulCodeSessions', () => {
  const withCap = {
    capabilities: [AgentCapabilities.execute_code, AgentCapabilities.stateful_code_sessions],
  };
  const withoutCap = { capabilities: [AgentCapabilities.execute_code] };

  it('enables only when code execution is active AND the capability is present', () => {
    expect(resolveStatefulCodeSessions(true, withCap)).toBe(true);
  });

  it('stays off when the capability is absent, even with code execution active', () => {
    expect(resolveStatefulCodeSessions(true, withoutCap)).toBe(false);
  });

  it('stays off when code execution is inactive, even with the capability present', () => {
    expect(resolveStatefulCodeSessions(false, withCap)).toBe(false);
  });

  it('stays off (default) when the endpoint config or capabilities are missing', () => {
    expect(resolveStatefulCodeSessions(true, undefined)).toBe(false);
    expect(resolveStatefulCodeSessions(true, {})).toBe(false);
    expect(resolveStatefulCodeSessions(true, { capabilities: [] })).toBe(false);
  });
});
