const { EModelEndpoint } = require('librechat-data-provider');
const { resolveRunTarget } = require('./headlessRequest');

describe('resolveRunTarget', () => {
  const appConfig = {
    modelSpecs: {
      list: [
        {
          name: 'default-spec',
          default: true,
          preset: { endpoint: 'openAI', model: 'gpt-4o' },
        },
      ],
    },
  };

  it('uses saved agent ids on the agents endpoint', () => {
    expect(
      resolveRunTarget({ agent_id: 'agent_abc123', endpoint: 'anthropic' }, appConfig),
    ).toEqual({
      agent_id: 'agent_abc123',
      endpoint: EModelEndpoint.agents,
    });
  });

  it('treats model-spec agent ids as endpoint runs, not saved agents', () => {
    expect(
      resolveRunTarget(
        {
          agent_id: 'anthropic__claude-sonnet-4-6___Claude Sonnet',
          endpoint: 'anthropic',
          model: 'claude-sonnet-4-6',
          spec: 'claude-sonnet-latest',
        },
        appConfig,
      ),
    ).toEqual({
      endpoint: 'anthropic',
      endpointType: undefined,
      model: 'claude-sonnet-4-6',
      spec: 'claude-sonnet-latest',
    });
  });
});
