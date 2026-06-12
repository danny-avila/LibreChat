import { Providers } from '@librechat/agents';
import { AuthKeys, EModelEndpoint } from 'librechat-data-provider';
import type { EndpointDbMethods, ServerRequest } from '~/types';

const mockGetGoogleConfig = jest.fn(
  (_credentials?: unknown, _options?: unknown, _acceptRawApiKey?: unknown) => ({
    provider: Providers.VERTEXAI,
    llmConfig: { model: 'gemini-2.5-flash' },
  }),
);
const mockIsEnabled = jest.fn();
const mockLoadServiceKey = jest.fn();
const mockCheckUserKeyExpiry = jest.fn();

jest.mock('./llm', () => ({
  getGoogleConfig: (credentials: unknown, options: unknown, acceptRawApiKey?: unknown) =>
    mockGetGoogleConfig(credentials, options, acceptRawApiKey),
}));

jest.mock('~/utils', () => ({
  isEnabled: (value: unknown) => mockIsEnabled(value),
  loadServiceKey: (keyPath: unknown) => mockLoadServiceKey(keyPath),
  checkUserKeyExpiry: (expiresAt: unknown, endpoint: unknown) =>
    mockCheckUserKeyExpiry(expiresAt, endpoint),
}));

import { initializeGoogle } from './initialize';

function createDb(): EndpointDbMethods {
  return {
    getUserKey: jest.fn().mockResolvedValue('user-google-key'),
    getUserKeyValues: jest.fn().mockResolvedValue({}),
  };
}

function createReq(): ServerRequest {
  return {
    body: {},
    config: {},
    user: { id: 'user-1' },
  } as ServerRequest;
}

function getGoogleConfigCall(): [Record<string, unknown>, Record<string, unknown>] {
  expect(mockGetGoogleConfig).toHaveBeenCalled();
  return mockGetGoogleConfig.mock.calls[0] as unknown as [
    Record<string, unknown>,
    Record<string, unknown>,
  ];
}

describe('initializeGoogle', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.GOOGLE_KEY;
    delete process.env.GOOGLE_REVERSE_PROXY;
    delete process.env.GOOGLE_AUTH_HEADER;
    delete process.env.GOOGLE_SERVICE_KEY_FILE;
    delete process.env.VERTEX_PROJECT_ID;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GCLOUD_PROJECT;
    delete process.env.GOOGLE_PROJECT_ID;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('forces Vertex AI ADC config and ignores GOOGLE_KEY for vertexai endpoint', async () => {
    process.env.GOOGLE_KEY = 'test-api-key';
    process.env.VERTEX_PROJECT_ID = 'fiery-catwalk-385918';
    mockLoadServiceKey.mockResolvedValue(null);

    const db = createDb();

    await initializeGoogle({
      req: createReq(),
      endpoint: Providers.VERTEXAI,
      model_parameters: { model: 'gemini-2.5-flash' },
      db,
    });

    expect(mockLoadServiceKey).toHaveBeenCalledTimes(1);
    expect(db.getUserKey).not.toHaveBeenCalled();
    expect(mockCheckUserKeyExpiry).not.toHaveBeenCalled();

    const [credentials, options] = getGoogleConfigCall();
    expect(credentials).toEqual({
      [AuthKeys.GOOGLE_SERVICE_KEY]: {},
    });
    expect(credentials).not.toHaveProperty(AuthKeys.GOOGLE_API_KEY);
    expect(options).toEqual(
      expect.objectContaining({
        forceVertex: true,
        projectId: 'fiery-catwalk-385918',
        modelOptions: { model: 'gemini-2.5-flash' },
      }),
    );
  });

  it('keeps Google API-key config for the google endpoint', async () => {
    process.env.GOOGLE_KEY = 'test-api-key';
    process.env.VERTEX_PROJECT_ID = 'fiery-catwalk-385918';

    await initializeGoogle({
      req: createReq(),
      endpoint: EModelEndpoint.google,
      model_parameters: { model: 'gemini-2.5-flash' },
      db: createDb(),
    });

    expect(mockLoadServiceKey).not.toHaveBeenCalled();

    const [credentials, options] = getGoogleConfigCall();
    expect(credentials).toEqual({
      [AuthKeys.GOOGLE_SERVICE_KEY]: {},
      [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
    });
    expect(options).toEqual(
      expect.objectContaining({
        forceVertex: false,
        projectId: undefined,
        modelOptions: { model: 'gemini-2.5-flash' },
      }),
    );
  });
});
