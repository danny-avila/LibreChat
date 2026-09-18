import type { Agent } from 'librechat-data-provider';
import type { InitializeAgentDbMethods, InitializeAgentParams } from './initialize';
import { initializeAgent } from './initialize';

describe('initializeAgent instruction prompts', () => {
  it('resolves referenced instructions at the shared initialization boundary', async () => {
    const agent = {
      id: 'agent-1',
      name: 'Agent',
      provider: 'blocked-provider',
      model: 'model',
      instructions: '',
      instruction_prompt: { source: 'langfuse', name: 'agent-policy' },
      tools: [],
    } as unknown as Agent;
    const resolver = {
      resolve: jest.fn().mockResolvedValue({
        prompt: 'Resolved instructions',
        source: 'langfuse',
        name: 'agent-policy',
        version: 3,
      }),
    };

    await expect(
      initializeAgent(
        {
          runtime: {
            user: { id: 'user-1', role: 'USER' },
            appConfig: {},
          },
          agent,
          allowedProviders: new Set(['allowed-provider']),
        } as unknown as InitializeAgentParams,
        { instructionPromptResolver: resolver } as unknown as InitializeAgentDbMethods,
      ),
    ).rejects.toThrow();

    expect(resolver.resolve).toHaveBeenCalledWith(agent.instruction_prompt, {
      userId: 'user-1',
      role: 'USER',
      appConfig: {},
    });
    expect(agent.instructions).toBe('Resolved instructions');
    expect(agent.resolved_instruction_prompt).toEqual({
      source: 'langfuse',
      name: 'agent-policy',
      version: 3,
    });
  });
});
