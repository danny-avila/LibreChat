import type { Agent, AgentModelParameters } from 'librechat-data-provider';
import { Constants } from 'librechat-data-provider';
import type { LoadAgentDeps, LoadAgentParams } from '../load';
import { loadAgent } from '../load';
import { RESPONSE_PROMPTS_BY_APP_ID } from '../generatedResponsePrompts';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('~/app/config', () => ({
  getCustomEndpointConfig: jest.fn(),
}));

const makeAgent = (overrides: Partial<Agent> = {}): Agent =>
  ({
    id: 'agent_case_context',
    provider: 'openai',
    model: 'gpt-4o',
    instructions: 'Stored author instructions.',
    ...overrides,
  }) as Agent;

const makeParams = (instructions?: string): LoadAgentParams => ({
  req: {
    user: { id: 'user-1' },
    body: instructions === undefined ? {} : { instructions },
  },
  agent_id: 'agent_case_context',
  endpoint: 'openai',
  model_parameters: { model: 'gpt-4o' } as AgentModelParameters,
});

describe('loadAgent request instructions', () => {
  test('uses top-level request instructions for ephemeral agents', async () => {
    const deps: LoadAgentDeps = {
      getAgent: jest.fn(),
      getMCPServerTools: jest.fn(),
    };

    const result = await loadAgent(
      {
        req: {
          user: { id: 'user-1' },
          body: { instructions: 'Repository app prompt.' },
        },
        agent_id: Constants.EPHEMERAL_AGENT_ID as string,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4o' } as AgentModelParameters,
      },
      deps,
    );

    expect(result?.instructions).toBe('Repository app prompt.');
    expect(deps.getAgent).not.toHaveBeenCalled();
  });

  test('appends trusted per-run case context without mutating stored instructions', async () => {
    const getAgent = jest.fn(async () =>
      makeAgent({ additional_instructions: 'Existing dynamic context.' }),
    );
    const deps: LoadAgentDeps = {
      getAgent,
      getMCPServerTools: jest.fn(),
    };

    const result = await loadAgent(
      makeParams('Case context: active caseId is 73181283.'),
      deps,
    );

    expect(result?.instructions).toBe('Stored author instructions.');
    expect(result?.additional_instructions).toBe(
      'Existing dynamic context.\n\nCase context: active caseId is 73181283.',
    );
    expect(getAgent).toHaveBeenCalledWith({ id: 'agent_case_context' });
  });

  test('uses the repository app prompt as primary instructions for persistent agents', async () => {
    const prompt = RESPONSE_PROMPTS_BY_APP_ID['1'].instructions;
    const getAgent = jest.fn(async () => makeAgent());
    const deps: LoadAgentDeps = {
      getAgent,
      getMCPServerTools: jest.fn(),
    };

    const result = await loadAgent(
      {
        req: {
          user: { id: 'user-1' },
          body: { appId: 1, instructions: `${prompt}\n\nCase context: active caseId is 73181283.` },
        },
        agent_id: 'agent_case_context',
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4o' } as AgentModelParameters,
      },
      deps,
    );

    expect(result?.instructions).toBe(`${prompt}\n\nStored author instructions.`);
    expect(result?.additional_instructions).toBe('Case context: active caseId is 73181283.');
  });

  test('keeps the repository app prompt when callers supply alternate instructions', async () => {
    const prompt = RESPONSE_PROMPTS_BY_APP_ID['2'].instructions;
    const deps: LoadAgentDeps = {
      getAgent: jest.fn(async () => makeAgent()),
      getMCPServerTools: jest.fn(),
    };

    const result = await loadAgent(
      {
        req: { user: { id: 'user-1' }, body: { appId: 2, instructions: 'Caller replacement instructions.' } },
        agent_id: 'agent_case_context',
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4o' } as AgentModelParameters,
      },
      deps,
    );

    expect(result?.instructions).toBe(`${prompt}\n\nStored author instructions.`);
    expect(result?.additional_instructions).toBe('Caller replacement instructions.');
  });

  test('ignores blank request instructions and leaves dynamic context unchanged', async () => {
    const agent = makeAgent({ additional_instructions: 'Existing dynamic context.' });
    const deps: LoadAgentDeps = {
      getAgent: jest.fn(async () => agent),
      getMCPServerTools: jest.fn(),
    };

    const result = await loadAgent(makeParams('   '), deps);

    expect(result?.additional_instructions).toBe('Existing dynamic context.');
    expect(result?.instructions).toBe('Stored author instructions.');
  });
});
