import { collectReachableAgents } from './traversal';

interface TestAgent {
  id: string;
  subagentAgentConfigs?: Array<TestAgent | null>;
}

describe('collectReachableAgents', () => {
  it('collects nested and shared agents once in breadth-first order', () => {
    const leaf: TestAgent = { id: 'leaf' };
    const first: TestAgent = { id: 'first', subagentAgentConfigs: [leaf] };
    const second: TestAgent = { id: 'second', subagentAgentConfigs: [leaf] };
    const root: TestAgent = { id: 'root', subagentAgentConfigs: [first, second] };

    expect(collectReachableAgents([root])).toEqual([root, first, second, leaf]);
  });

  it('is cycle-safe while retaining every distinct reachable snapshot', () => {
    const first: TestAgent = { id: 'shared-id' };
    const second: TestAgent = { id: 'shared-id' };
    first.subagentAgentConfigs = [second];
    second.subagentAgentConfigs = [first, null];

    expect(collectReachableAgents([first])).toEqual([first, second]);
  });
});
