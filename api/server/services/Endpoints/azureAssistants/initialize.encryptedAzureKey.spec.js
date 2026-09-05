// jestSetup.js (this workspace's global setup) already sets CREDS_KEY to the
// literal 'test' for the many suites that never touch real encryption — too
// short for encryptV3's 32-byte key requirement, so it must be overridden
// unconditionally here, not with `??`, and restored after so the override
// doesn't leak into other test files sharing this worker.
const originalCredsKey = process.env.CREDS_KEY;
process.env.CREDS_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const { EModelEndpoint } = require('librechat-data-provider');

const mockCheckUserKeyExpiry = jest.fn();
const mockGetProxyDispatcher = jest.fn(() => null);
jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  isUserProvided: (val) => val === 'user_provided',
  checkUserKeyExpiry: (...args) => mockCheckUserKeyExpiry(...args),
  getProxyDispatcher: (...args) => mockGetProxyDispatcher(...args),
}));

const mockGetUserKeyValues = jest.fn();
const mockGetUserKeyExpiry = jest.fn();
jest.mock('~/models', () => ({
  getUserKeyValues: (...args) => mockGetUserKeyValues(...args),
  getUserKeyExpiry: (...args) => mockGetUserKeyExpiry(...args),
}));

let capturedOpenAIOptions;
jest.mock('openai', () => {
  return jest.fn().mockImplementation((options) => {
    capturedOpenAIOptions = options;
    return { beta: { assistants: {} } };
  });
});

// Loaded via dynamic import in beforeAll so encryption initializes after
// CREDS_KEY is set above (encryptV3 reads the key at module load) — matches
// the pattern in admin/secrets.spec.ts and the sibling azureOpenAI
// initializer's own encrypted-key spec, required here because this
// initializer transitively imports the admin secrets module via
// `@librechat/api`'s `resolveConfigSecret`.
let initializeClient;
let encryptV3;

beforeAll(async () => {
  initializeClient = require('./initialize');
  ({ encryptV3 } = await import('@librechat/data-schemas'));
});

/**
 * `endpoints.azureOpenAI.groups[].apiKey` is encrypted at rest by the admin
 * config write path. Unlike the regular Azure OpenAI initializer, this
 * Assistants-specific initializer assigned the stored ciphertext straight to
 * `apiKey`/`azureOptions` without ever decrypting it — the OpenAI client's
 * own `apiKey` (used to build its default `Authorization` header) and
 * anything reading `openai.locals.azureOptions` afterward would receive the
 * ciphertext, not the real secret.
 */
describe('azureAssistants initializeClient decrypts an encrypted Azure group apiKey', () => {
  afterAll(() => {
    process.env.CREDS_KEY = originalCredsKey;
  });

  afterEach(() => {
    jest.clearAllMocks();
    capturedOpenAIOptions = undefined;
  });

  function createReq(groupOverrides) {
    return {
      user: { id: 'user-1' },
      body: {},
      query: {},
      config: {
        endpoints: {
          [EModelEndpoint.azureOpenAI]: {
            assistants: true,
            modelGroupMap: { 'gpt-4': { group: 'prod' } },
            groupMap: { prod: groupOverrides },
            assistantModels: ['gpt-4'],
          },
        },
      },
    };
  }

  it('decrypts an encrypted serverless group apiKey for both the api-key header and the OpenAI client', async () => {
    const encrypted = encryptV3('sk-azure-serverless-secret');
    const req = createReq({
      serverless: true,
      baseURL: 'https://prod.example.com',
      apiKey: encrypted,
      instanceName: 'prod-instance',
      deploymentName: 'gpt-4-deployment',
      version: '2024-02-01',
      models: { 'gpt-4': true },
    });

    const { openAIApiKey } = await initializeClient({
      req,
      res: {},
      version: 'v2',
      endpointOption: {},
      initAppClient: true,
    });

    expect(openAIApiKey).toBe('sk-azure-serverless-secret');
    expect(capturedOpenAIOptions.apiKey).toBe('sk-azure-serverless-secret');
  });

  it('decrypts an encrypted non-serverless group apiKey for the OpenAI client and azureOptions locals', async () => {
    const encrypted = encryptV3('sk-azure-managed-secret');
    const req = createReq({
      instanceName: 'prod-instance',
      deploymentName: 'gpt-4-deployment',
      version: '2024-02-01',
      models: { 'gpt-4': true },
      apiKey: encrypted,
    });

    const { openai, openAIApiKey } = await initializeClient({
      req,
      res: {},
      version: 'v2',
      endpointOption: {},
      initAppClient: true,
    });

    expect(openAIApiKey).toBe('sk-azure-managed-secret');
    expect(capturedOpenAIOptions.apiKey).toBe('sk-azure-managed-secret');
    expect(openai.locals.azureOptions.azureOpenAIApiKey).toBe('sk-azure-managed-secret');
  });
});
