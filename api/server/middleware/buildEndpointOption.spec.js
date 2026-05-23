/**
 * Wrap parseCompactConvo: the REAL function runs, but jest can observe
 * calls and return values. Must be declared before require('./buildEndpointOption')
 * so the destructured reference in the middleware captures the wrapper.
 */
jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    parseCompactConvo: jest.fn((...args) => actual.parseCompactConvo(...args)),
  };
});

const { EModelEndpoint, parseCompactConvo } = require('librechat-data-provider');

const mockBuildOptions = jest.fn((_endpoint, parsedBody) => ({
  ...parsedBody,
  endpoint: _endpoint,
}));
const mockAgentBuildOptions = jest.fn((_req, endpoint, parsedBody) => ({
  ...parsedBody,
  endpoint,
}));

jest.mock('~/server/services/Endpoints/azureAssistants', () => ({
  buildOptions: mockBuildOptions,
}));
jest.mock('~/server/services/Endpoints/assistants', () => ({
  buildOptions: mockBuildOptions,
}));
jest.mock('~/server/services/Endpoints/agents', () => ({
  buildOptions: mockAgentBuildOptions,
}));

jest.mock('~/models', () => ({
  updateFilesUsage: jest.fn(),
}));

const mockGetEndpointsConfig = jest.fn();
jest.mock('~/server/services/Config', () => ({
  getEndpointsConfig: (...args) => mockGetEndpointsConfig(...args),
}));

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  handleError: jest.fn(),
}));

const buildEndpointOption = require('./buildEndpointOption');

const createReq = (body, config = {}) => ({
  body,
  config,
  baseUrl: '/api/chat',
});

const createRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

describe('buildEndpointOption - defaultParamsEndpoint parsing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should pass defaultParamsEndpoint to parseCompactConvo and preserve maxOutputTokens', async () => {
    mockGetEndpointsConfig.mockResolvedValue({
      AnthropicClaude: {
        type: EModelEndpoint.custom,
        customParams: {
          defaultParamsEndpoint: EModelEndpoint.anthropic,
        },
      },
    });

    const req = createReq(
      {
        endpoint: 'AnthropicClaude',
        endpointType: EModelEndpoint.custom,
        model: 'anthropic/claude-opus-4.5',
        temperature: 0.7,
        maxOutputTokens: 8192,
        topP: 0.9,
        maxContextTokens: 50000,
      },
      { modelSpecs: null },
    );

    await buildEndpointOption(req, createRes(), jest.fn());

    expect(parseCompactConvo).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultParamsEndpoint: EModelEndpoint.anthropic,
      }),
    );

    const parsedResult = parseCompactConvo.mock.results[0].value;
    expect(parsedResult.maxOutputTokens).toBe(8192);
    expect(parsedResult.topP).toBe(0.9);
    expect(parsedResult.temperature).toBe(0.7);
    expect(parsedResult.maxContextTokens).toBe(50000);
  });

  it('should strip maxOutputTokens when no defaultParamsEndpoint is configured', async () => {
    mockGetEndpointsConfig.mockResolvedValue({
      MyOpenRouter: {
        type: EModelEndpoint.custom,
      },
    });

    const req = createReq(
      {
        endpoint: 'MyOpenRouter',
        endpointType: EModelEndpoint.custom,
        model: 'gpt-4o',
        temperature: 0.7,
        maxOutputTokens: 8192,
        max_tokens: 4096,
      },
      { modelSpecs: null },
    );

    await buildEndpointOption(req, createRes(), jest.fn());

    expect(parseCompactConvo).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultParamsEndpoint: undefined,
      }),
    );

    const parsedResult = parseCompactConvo.mock.results[0].value;
    expect(parsedResult.maxOutputTokens).toBeUndefined();
    expect(parsedResult.max_tokens).toBe(4096);
    expect(parsedResult.temperature).toBe(0.7);
  });

  it('should strip bedrock region from custom endpoint without defaultParamsEndpoint', async () => {
    mockGetEndpointsConfig.mockResolvedValue({
      MyEndpoint: {
        type: EModelEndpoint.custom,
      },
    });

    const req = createReq(
      {
        endpoint: 'MyEndpoint',
        endpointType: EModelEndpoint.custom,
        model: 'gpt-4o',
        temperature: 0.7,
        region: 'us-east-1',
      },
      { modelSpecs: null },
    );

    await buildEndpointOption(req, createRes(), jest.fn());

    const parsedResult = parseCompactConvo.mock.results[0].value;
    expect(parsedResult.region).toBeUndefined();
    expect(parsedResult.temperature).toBe(0.7);
  });

  it('should pass defaultParamsEndpoint when re-parsing enforced model spec', async () => {
    mockGetEndpointsConfig.mockResolvedValue({
      AnthropicClaude: {
        type: EModelEndpoint.custom,
        customParams: {
          defaultParamsEndpoint: EModelEndpoint.anthropic,
        },
      },
    });

    const modelSpec = {
      name: 'claude-opus-4.5',
      preset: {
        endpoint: 'AnthropicClaude',
        endpointType: EModelEndpoint.custom,
        model: 'anthropic/claude-opus-4.5',
        temperature: 0.7,
        maxOutputTokens: 8192,
        maxContextTokens: 50000,
      },
    };

    const req = createReq(
      {
        endpoint: 'AnthropicClaude',
        endpointType: EModelEndpoint.custom,
        spec: 'claude-opus-4.5',
        model: 'anthropic/claude-opus-4.5',
      },
      {
        modelSpecs: {
          enforce: true,
          list: [modelSpec],
        },
      },
    );

    await buildEndpointOption(req, createRes(), jest.fn());

    const enforcedCall = parseCompactConvo.mock.calls[1];
    expect(enforcedCall[0]).toEqual(
      expect.objectContaining({
        defaultParamsEndpoint: EModelEndpoint.anthropic,
      }),
    );

    const enforcedResult = parseCompactConvo.mock.results[1].value;
    expect(enforcedResult.maxOutputTokens).toBe(8192);
    expect(enforcedResult.temperature).toBe(0.7);
    expect(enforcedResult.maxContextTokens).toBe(50000);
  });

  it('should restore private model spec preset fields in non-enforced mode', async () => {
    mockGetEndpointsConfig.mockResolvedValue({});

    const modelSpec = {
      name: 'guarded-openai',
      iconURL: 'openAI',
      preset: {
        endpoint: EModelEndpoint.openAI,
        model: 'gpt-4o',
        promptPrefix: 'private prompt prefix',
        instructions: 'private instructions',
        additional_instructions: 'private additional instructions',
        temperature: 0.2,
        maxContextTokens: 10000,
      },
    };

    const req = createReq(
      {
        endpoint: EModelEndpoint.openAI,
        spec: 'guarded-openai',
        model: 'gpt-4o',
        temperature: 0.8,
      },
      {
        modelSpecs: {
          enforce: false,
          list: [modelSpec],
        },
      },
    );
    req.baseUrl = '/api/agents/chat';

    await buildEndpointOption(req, createRes(), jest.fn());

    expect(req.body.endpointOption.promptPrefix).toBe('private prompt prefix');
    expect(req.body.endpointOption.instructions).toBeUndefined();
    expect(req.body.endpointOption.additional_instructions).toBeUndefined();
    expect(req.body.endpointOption.temperature).toBe(0.8);
    expect(req.body.endpointOption.maxContextTokens).toBeUndefined();
    expect(req.body.endpointOption.iconURL).toBe('openAI');
  });

  it('should reject non-enforced model specs for a different endpoint', async () => {
    mockGetEndpointsConfig.mockResolvedValue({});

    const req = createReq(
      {
        endpoint: EModelEndpoint.openAI,
        spec: 'guarded-google',
        model: 'gpt-4o',
      },
      {
        modelSpecs: {
          enforce: false,
          list: [
            {
              name: 'guarded-google',
              preset: {
                endpoint: EModelEndpoint.google,
                model: 'gemini-pro',
                promptPrefix: 'private google prompt',
              },
            },
          ],
        },
      },
    );
    const res = createRes();
    const next = jest.fn();
    const { handleError } = require('@librechat/api');

    await buildEndpointOption(req, res, next);

    expect(handleError).toHaveBeenCalledWith(res, { text: 'Model spec mismatch' });
    expect(mockAgentBuildOptions).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('should restore private model spec examples when the parser supplies an empty default', async () => {
    mockGetEndpointsConfig.mockResolvedValue({});

    const examples = [{ input: { content: 'hello' }, output: { content: 'world' } }];
    const req = createReq(
      {
        endpoint: EModelEndpoint.google,
        spec: 'guarded-google',
        model: 'gemini-pro',
      },
      {
        modelSpecs: {
          enforce: false,
          list: [
            {
              name: 'guarded-google',
              preset: {
                endpoint: EModelEndpoint.google,
                model: 'gemini-pro',
                examples,
              },
            },
          ],
        },
      },
    );
    req.baseUrl = '/api/agents/chat';

    await buildEndpointOption(req, createRes(), jest.fn());

    expect(req.body.endpointOption.examples).toEqual(examples);
  });

  it('should resolve special variables for restored non-agent promptPrefix', async () => {
    mockGetEndpointsConfig.mockResolvedValue({});

    const req = createReq(
      {
        endpoint: EModelEndpoint.assistants,
        spec: 'guarded-assistant',
        assistant_id: 'asst_123',
      },
      {
        modelSpecs: {
          enforce: false,
          list: [
            {
              name: 'guarded-assistant',
              preset: {
                endpoint: EModelEndpoint.assistants,
                assistant_id: 'asst_123',
                promptPrefix: 'Help {{current_user}}.',
              },
            },
          ],
        },
      },
    );
    req.user = { name: 'Ada' };

    await buildEndpointOption(req, createRes(), jest.fn());

    expect(req.body.endpointOption.promptPrefix).toBe('Help Ada.');
  });

  it('should leave restored agent promptPrefix variables for agent initialization', async () => {
    mockGetEndpointsConfig.mockResolvedValue({});

    const req = createReq(
      {
        endpoint: EModelEndpoint.openAI,
        spec: 'guarded-openai',
        model: 'gpt-4o',
      },
      {
        modelSpecs: {
          enforce: false,
          list: [
            {
              name: 'guarded-openai',
              preset: {
                endpoint: EModelEndpoint.openAI,
                model: 'gpt-4o',
                promptPrefix: 'Help {{current_user}}.',
              },
            },
          ],
        },
      },
    );
    req.baseUrl = '/api/agents/chat';
    req.user = { name: 'Ada' };

    await buildEndpointOption(req, createRes(), jest.fn());

    expect(req.body.endpointOption.promptPrefix).toBe('Help {{current_user}}.');
  });

  it('should fall back to OpenAI schema when getEndpointsConfig fails', async () => {
    mockGetEndpointsConfig.mockRejectedValue(new Error('Config unavailable'));

    const req = createReq(
      {
        endpoint: 'AnthropicClaude',
        endpointType: EModelEndpoint.custom,
        model: 'anthropic/claude-opus-4.5',
        temperature: 0.7,
        maxOutputTokens: 8192,
        max_tokens: 4096,
      },
      { modelSpecs: null },
    );

    await buildEndpointOption(req, createRes(), jest.fn());

    expect(parseCompactConvo).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultParamsEndpoint: undefined,
      }),
    );

    const parsedResult = parseCompactConvo.mock.results[0].value;
    expect(parsedResult.maxOutputTokens).toBeUndefined();
    expect(parsedResult.max_tokens).toBe(4096);
  });

  it('should not enter the enforce branch when modelSpecs.list is empty', async () => {
    mockGetEndpointsConfig.mockResolvedValue({});

    const req = createReq(
      {
        endpoint: EModelEndpoint.openAI,
        model: 'gpt-4',
      },
      {
        modelSpecs: {
          enforce: true,
          list: [],
        },
      },
    );
    const res = createRes();
    const { handleError } = require('@librechat/api');

    await buildEndpointOption(req, res, jest.fn());

    expect(handleError).not.toHaveBeenCalledWith(
      res,
      expect.objectContaining({ text: 'No model spec selected' }),
    );
    expect(handleError).not.toHaveBeenCalledWith(
      res,
      expect.objectContaining({ text: 'Invalid model spec' }),
    );
  });
});
