import { anyAgentHasStatefulSessions } from './run';

type WalkInput = Parameters<typeof anyAgentHasStatefulSessions>[0];

interface TestAgent {
  id: string;
  statefulCodeSessions?: boolean;
  subagentAgentConfigs?: Array<TestAgent | null>;
}

function agent(
  id: string,
  statefulCodeSessions?: boolean,
  subagentAgentConfigs?: Array<TestAgent | null>,
): TestAgent {
  return { id, statefulCodeSessions, subagentAgentConfigs };
}

function walk(agents: Array<TestAgent | null | undefined>): boolean {
  return anyAgentHasStatefulSessions(agents as WalkInput);
}

describe('anyAgentHasStatefulSessions', () => {
  it('is true when a top-level agent resolved the per-agent flag at initialization', () => {
    expect(walk([agent('a', true)])).toBe(true);
    expect(walk([agent('a', false), agent('b', true)])).toBe(true);
  });

  it('stays off (default) when no agent opted in or the flag is absent', () => {
    expect(walk([])).toBe(false);
    expect(walk([agent('a')])).toBe(false);
    expect(walk([agent('a', false)])).toBe(false);
  });

  it('walks nested subagent configs so a stateful subagent activates the run', () => {
    const grandchild = agent('c', true);
    const child = agent('b', false, [grandchild]);
    expect(walk([agent('a', false, [child])])).toBe(true);
  });

  it('tolerates null entries and cycles in the subagent graph', () => {
    const a = agent('a', false);
    const b = agent('b', false);
    a.subagentAgentConfigs = [b, null];
    b.subagentAgentConfigs = [a];
    expect(walk([a, undefined, null])).toBe(false);
  });
});
