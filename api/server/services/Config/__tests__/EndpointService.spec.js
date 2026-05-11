const mockDataProvider = {
  Capabilities: {
    actions: 'actions',
    code_interpreter: 'code_interpreter',
    image_vision: 'image_vision',
    retrieval: 'retrieval',
    tools: 'tools',
  },
  EModelEndpoint: {
    agents: 'agents',
    anthropic: 'anthropic',
    assistants: 'assistants',
    azureAssistants: 'azureAssistants',
    azureOpenAI: 'azureOpenAI',
    bedrock: 'bedrock',
    google: 'google',
    openAI: 'openAI',
  },
  defaultAgentCapabilities: [],
  defaultRetrievalModels: [],
  defaultAssistantsVersion: {
    assistants: 1,
    azureAssistants: 2,
  },
  isAgentsEndpoint: (endpoint) => endpoint === 'agents',
  isAssistantsEndpoint: (endpoint) => endpoint === 'assistants' || endpoint === 'azureAssistants',
};

jest.mock(
  '@librechat/api',
  () => ({
    sendEvent: jest.fn(),
    isEnabled: (value) => value === true || value === 'true' || value === '1',
    isUserProvided: (value) => value === 'user_provided',
  }),
  { virtual: true },
);

jest.mock('librechat-data-provider', () => mockDataProvider, { virtual: true });

jest.mock('~/server/utils/handleText', () => ({
  generateConfig: (key) => (key ? { userProvide: key === 'user_provided' } : false),
}));

describe('EndpointService', () => {
  let originalEnv;
  const { EModelEndpoint } = mockDataProvider;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  function loadConfig(env) {
    process.env = { ...originalEnv };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_USE_VERTEX;
    Object.assign(process.env, env);
    return require('../EndpointService').config;
  }

  it('does not require a user Anthropic API key when Vertex AI is enabled by env', () => {
    const config = loadConfig({
      ANTHROPIC_API_KEY: 'user_provided',
      ANTHROPIC_USE_VERTEX: 'true',
    });

    expect(config[EModelEndpoint.anthropic]).toEqual({ userProvide: false });
  });

  it('requires a user Anthropic API key when user_provided is set without Vertex AI', () => {
    const config = loadConfig({
      ANTHROPIC_API_KEY: 'user_provided',
    });

    expect(config[EModelEndpoint.anthropic]).toEqual({ userProvide: true });
  });
});
