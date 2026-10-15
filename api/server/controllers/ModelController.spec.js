const mockLoadDefaultModels = jest.fn();
const mockLoadConfigModels = jest.fn();
const mockGetEndpointsConfig = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock('~/server/services/Config', () => ({
  loadDefaultModels: (...args) => mockLoadDefaultModels(...args),
  loadConfigModels: (...args) => mockLoadConfigModels(...args),
  getEndpointsConfig: (...args) => mockGetEndpointsConfig(...args),
}));

const { loadModels, getModelsConfig } = require('./ModelController');

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('loadModels', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEndpointsConfig.mockResolvedValue({ openAI: {}, Cogsworth: {} });
  });

  it('loads default and configured models concurrently while preserving custom precedence', async () => {
    const defaultModels = deferred();
    const configuredModels = deferred();
    const req = { user: { id: 'user-1' } };
    mockLoadDefaultModels.mockReturnValue(defaultModels.promise);
    mockLoadConfigModels.mockReturnValue(configuredModels.promise);

    const resultPromise = loadModels(req);

    expect(mockLoadDefaultModels).toHaveBeenCalledWith(req);
    expect(mockLoadConfigModels).toHaveBeenCalledWith(req);

    configuredModels.resolve({
      openAI: ['configured-model'],
      custom: ['custom-model'],
    });
    defaultModels.resolve({
      openAI: ['default-model'],
      anthropic: ['default-anthropic'],
    });

    await expect(resultPromise).resolves.toEqual({
      openAI: ['configured-model'],
      anthropic: ['default-anthropic'],
      custom: ['custom-model'],
    });
  });

  it('filters model groups using the user-scoped endpoint catalog', async () => {
    const req = { user: { id: 'user-1', username: 'winston' } };
    mockLoadDefaultModels.mockResolvedValue({ openAI: ['gpt-4o'] });
    mockLoadConfigModels.mockResolvedValue({ Cogsworth: ['cogsworth'], Abbenay: ['model-a'] });
    mockGetEndpointsConfig.mockResolvedValue({ Cogsworth: {} });

    await expect(getModelsConfig(req)).resolves.toEqual({ Cogsworth: ['cogsworth'] });
    expect(mockGetEndpointsConfig).toHaveBeenCalledWith(req);
  });
});
