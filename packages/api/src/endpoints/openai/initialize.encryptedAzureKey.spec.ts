process.env.CREDS_KEY =
  process.env.CREDS_KEY ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

import { EModelEndpoint } from 'librechat-data-provider';
import type { BaseInitializeParams } from '~/types';

const mockValidateEndpointURL = jest.fn();
jest.mock('~/auth', () => ({
  validateEndpointURL: (...args: unknown[]) => mockValidateEndpointURL(...args),
}));

const mockGetOpenAIConfig = jest.fn().mockReturnValue({
  llmConfig: { model: 'gpt-4' },
  configOptions: {},
});
jest.mock('./config', () => ({
  getOpenAIConfig: (...args: unknown[]) => mockGetOpenAIConfig(...args),
}));

jest.mock('~/utils', () => ({
  ...jest.requireActual('~/utils'),
  getAzureCredentials: jest.fn(),
  resolveHeaders: jest.fn(() => ({})),
  isUserProvided: (val: string) => val === 'user_provided',
  checkUserKeyExpiry: jest.fn(),
}));

// Loaded via dynamic import in beforeAll so encryption initializes after
// CREDS_KEY is set above (encryptV3 reads the key at module load) — matches
// the pattern in admin/secrets.spec.ts, required here because `./initialize`
// transitively imports the admin secrets module.
let initializeOpenAI: typeof import('./initialize').initializeOpenAI;
let encryptV3: typeof import('@librechat/data-schemas').encryptV3;

beforeAll(async () => {
  ({ initializeOpenAI } = await import('./initialize'));
  ({ encryptV3 } = await import('@librechat/data-schemas'));
});

/**
 * `endpoints.azureOpenAI.groups[].apiKey` is encrypted at rest by the admin
 * config write path. `mapModelToAzureConfig` (packages/data-provider) only
 * resolves `${ENV_VAR}` placeholders — it has no access to the admin secrets
 * module — so the ciphertext must be decrypted here, at the point
 * `initializeOpenAI` pulls the resolved Azure options off the app config,
 * before it reaches either the serverless `api-key` header or the Azure SDK
 * client's own `azureOpenAIApiKey` field.
 */
describe('initializeOpenAI decrypts an encrypted Azure group apiKey', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  function createAzureParams(groupOverrides: Record<string, unknown>): BaseInitializeParams {
    return {
      req: {
        user: { id: 'user-1' },
        body: {},
        config: {
          endpoints: {
            [EModelEndpoint.azureOpenAI]: {
              modelGroupMap: { 'gpt-4': { group: 'prod' } },
              groupMap: { prod: groupOverrides },
            },
          },
        },
      } as unknown as BaseInitializeParams['req'],
      endpoint: EModelEndpoint.azureOpenAI,
      model_parameters: { model: 'gpt-4' },
      db: {} as unknown as BaseInitializeParams['db'],
    };
  }

  it('decrypts an encrypted serverless group apiKey before building the api-key header', async () => {
    const encrypted = encryptV3('sk-azure-serverless-secret');
    const params = createAzureParams({
      serverless: true,
      baseURL: 'https://prod.example.com',
      apiKey: encrypted,
    });

    await initializeOpenAI(params);

    const [, clientOptions] = mockGetOpenAIConfig.mock.calls[0];
    expect(clientOptions.headers['api-key']).toBe('sk-azure-serverless-secret');
    expect(mockGetOpenAIConfig).toHaveBeenCalledWith(
      'sk-azure-serverless-secret',
      expect.anything(),
      EModelEndpoint.azureOpenAI,
    );
  });

  it('decrypts an encrypted non-serverless group apiKey for both the resolved apiKey and the azure client options', async () => {
    const encrypted = encryptV3('sk-azure-managed-secret');
    const params = createAzureParams({
      instanceName: 'prod-instance',
      deploymentName: 'gpt-4-deployment',
      version: '2024-02-01',
      models: { 'gpt-4': true },
      apiKey: encrypted,
    });

    await initializeOpenAI(params);

    const [resolvedApiKey, clientOptions] = mockGetOpenAIConfig.mock.calls[0];
    expect(resolvedApiKey).toBe('sk-azure-managed-secret');
    expect(clientOptions.azure.azureOpenAIApiKey).toBe('sk-azure-managed-secret');
  });
});
