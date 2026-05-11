const { EModelEndpoint, openAISettings, anthropicSettings } = require('librechat-data-provider');

const mockGetModelsConfig = jest.fn();

jest.mock('~/server/controllers/ModelController', () => ({
  getModelsConfig: (...args) => mockGetModelsConfig(...args),
}));

jest.mock('@librechat/data-schemas', () => {
  const actual = jest.requireActual('@librechat/data-schemas');
  return {
    ...actual,
    getTenantId: () => 'test-tenant',
    logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
  };
});

const {
  pickFirstConfiguredModel,
  resolveImportDefaultModel,
  FALLBACK_MODEL_BY_ENDPOINT,
} = require('./defaults');

afterEach(() => {
  jest.clearAllMocks();
});

describe('pickFirstConfiguredModel', () => {
  it('returns the first non-empty string for the endpoint', () => {
    const modelsConfig = {
      [EModelEndpoint.anthropic]: ['claude-opus-4-7', 'claude-3-5-sonnet-latest'],
    };
    expect(pickFirstConfiguredModel(EModelEndpoint.anthropic, modelsConfig)).toBe(
      'claude-opus-4-7',
    );
  });

  it('skips empty strings', () => {
    const modelsConfig = {
      [EModelEndpoint.openAI]: ['', 'gpt-4o'],
    };
    expect(pickFirstConfiguredModel(EModelEndpoint.openAI, modelsConfig)).toBe('gpt-4o');
  });

  it('returns undefined when modelsConfig is missing', () => {
    expect(pickFirstConfiguredModel(EModelEndpoint.anthropic, undefined)).toBeUndefined();
  });

  it('returns undefined when the endpoint has no models', () => {
    expect(pickFirstConfiguredModel(EModelEndpoint.anthropic, {})).toBeUndefined();
    expect(
      pickFirstConfiguredModel(EModelEndpoint.anthropic, { [EModelEndpoint.anthropic]: [] }),
    ).toBeUndefined();
  });

  it('returns undefined when the endpoint value is not an array', () => {
    expect(
      pickFirstConfiguredModel(EModelEndpoint.anthropic, {
        [EModelEndpoint.anthropic]: 'claude-opus-4-7',
      }),
    ).toBeUndefined();
  });
});

describe('resolveImportDefaultModel', () => {
  it('returns the first model from modelsConfig when present', async () => {
    mockGetModelsConfig.mockResolvedValueOnce({
      [EModelEndpoint.anthropic]: ['claude-opus-4-7'],
    });

    const result = await resolveImportDefaultModel({
      endpoint: EModelEndpoint.anthropic,
      requestUserId: 'user-1',
      userRole: 'USER',
    });

    expect(result).toBe('claude-opus-4-7');
    expect(mockGetModelsConfig).toHaveBeenCalledWith({
      user: { id: 'user-1', role: 'USER', tenantId: 'test-tenant' },
    });
  });

  it('falls back to the per-endpoint default when modelsConfig has no models for the endpoint', async () => {
    mockGetModelsConfig.mockResolvedValueOnce({});

    const result = await resolveImportDefaultModel({
      endpoint: EModelEndpoint.anthropic,
      requestUserId: 'user-1',
    });

    expect(result).toBe(anthropicSettings.model.default);
  });

  it('falls back to the openAI default for unknown endpoints with no modelsConfig entry', async () => {
    mockGetModelsConfig.mockResolvedValueOnce({});

    const result = await resolveImportDefaultModel({
      endpoint: 'some-custom-endpoint',
      requestUserId: 'user-1',
    });

    expect(result).toBe(openAISettings.model.default);
  });

  it('falls back to the per-endpoint default when getModelsConfig rejects', async () => {
    mockGetModelsConfig.mockRejectedValueOnce(new Error('boom'));

    const result = await resolveImportDefaultModel({
      endpoint: EModelEndpoint.anthropic,
      requestUserId: 'user-1',
    });

    expect(result).toBe(anthropicSettings.model.default);
  });

  it('exposes hardcoded fallbacks for openAI and anthropic', () => {
    expect(FALLBACK_MODEL_BY_ENDPOINT[EModelEndpoint.openAI]).toBe(openAISettings.model.default);
    expect(FALLBACK_MODEL_BY_ENDPOINT[EModelEndpoint.anthropic]).toBe(
      anthropicSettings.model.default,
    );
  });
});
