jest.mock('~/app/clients/agents/Functions/initializeFunctionsAgent', () => {
  return jest.fn(async ({ tools }) => {
    // return a minimal executor with the provided tools so tests can inspect them
    return {
      tools,
      invoke: async ({ input }) => ({ output: `echo:${input}` }),
      call: async ({ input }) => ({ output: `echo:${input}` }),
      agent: { tools: tools.map(t => t.name), _allowedTools: tools.map(t => t.name) },
      memory: { clear: async () => {} },
    };
  });
});

const createWoodlandFunctionsAgent = require('~/app/clients/agents/Woodland/createWoodlandFunctionsAgent');

/**
 * This test verifies that hybrid QA tool selection logic works:
 *  - Both tools included when both env flags true and no allowedTools restriction
 *  - Filtering respects allowedTools
 *  - Tools excluded when flags false
 */

describe('Woodland Hybrid QA Tool Inclusion', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const fakeModel = {}; // not used due to initializeFunctionsAgent mock

  const baseParams = {
    model: fakeModel,
    pastMessages: [],
    currentDateString: new Date().toISOString(),
  };

  test('includes both QA tools when both flags enabled and no allowedTools restriction', async () => {
    process.env.WOODLAND_QA_ENABLED = 'true';
    process.env.WOODLAND_AZURE_QA_ENABLED = 'true';

    const agent = await createWoodlandFunctionsAgent(baseParams, {
      agentName: 'TestAgent',
      instructions: 'Test',
      allowedTools: undefined,
    });

    const names = agent.tools.map(t => t.name);
    expect(names).toContain('woodland-qa-knowledge');
    expect(names).toContain('woodland-azure-ai-search-qa');
  });

  test('filters QA tools based on allowedTools', async () => {
    process.env.WOODLAND_QA_ENABLED = 'true';
    process.env.WOODLAND_AZURE_QA_ENABLED = 'true';

    const agent = await createWoodlandFunctionsAgent(baseParams, {
      agentName: 'TestAgent',
      instructions: 'Test',
      allowedTools: ['woodland-azure-ai-search-qa'],
    });

    const names = agent.tools.map(t => t.name);
    expect(names).toContain('woodland-azure-ai-search-qa');
    expect(names).not.toContain('woodland-qa-knowledge');
  });

  test('excludes tools when flags disabled', async () => {
    process.env.WOODLAND_QA_ENABLED = 'false';
    process.env.WOODLAND_AZURE_QA_ENABLED = 'false';

    const agent = await createWoodlandFunctionsAgent(baseParams, {
      agentName: 'TestAgent',
      instructions: 'Test',
    });

    const names = agent.tools.map(t => t.name);
    expect(names).not.toContain('WoodlandQAKnowledge');
    expect(names).not.toContain('WoodlandAzureAISearchQA');
  });
});
