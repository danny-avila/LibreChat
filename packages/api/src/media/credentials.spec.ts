import { EModelEndpoint, FileSources } from 'librechat-data-provider';
import type { AppConfig, MediaMethods } from '@librechat/data-schemas';
import type { MediaIntegration } from 'librechat-data-provider';
import type { MediaEnvironment } from './credentials';
import { createMediaCredentialResolver } from './credentials';

describe('Google media credentials', () => {
  const integration: MediaIntegration = {
    id: 'google-images',
    api: 'google.generateContent',
    endpointRef: { kind: 'builtin', endpoint: EModelEndpoint.google },
    catalog: { kind: 'configured', models: ['gemini-3.1-flash-image'] },
    operations: ['image.generate', 'image.edit'],
  };
  const request = {
    scope: { ownerId: 'owner', tenantId: 'tenant' },
    integration,
    appConfig: {
      config: {},
      fileStrategy: FileSources.local,
      imageOutputType: 'png',
    } satisfies AppConfig,
    minValidityMs: 0,
  };
  const repository: Pick<MediaMethods, 'getStoredMediaCredential'> = {
    getStoredMediaCredential: async () => null,
  };
  const resolver = (environment: MediaEnvironment) =>
    createMediaCredentialResolver({
      environment,
      repository,
      decrypt: async (value) => value,
      now: () => 0,
    });

  it.each([undefined, ''])('uses the Gemini key when GOOGLE_KEY is %p', async (googleKey) => {
    const lookup = jest.spyOn(repository, 'getStoredMediaCredential');
    const environment = { GOOGLE_KEY: googleKey, GEMINI_API_KEY: 'gemini-deployment-key' };
    const connection = await resolver(environment)(request);

    expect(connection.headers).toEqual({ 'x-goog-api-key': 'gemini-deployment-key' });
    expect(connection.baseURL).toBe('https://generativelanguage.googleapis.com/v1beta');
    expect(lookup).not.toHaveBeenCalled();
    expect(environment.GOOGLE_KEY).toBe(googleKey);
  });

  it('preserves the configured Google key and its binding when the unused Gemini key changes', async () => {
    const environment = { GOOGLE_KEY: 'google-deployment-key', GEMINI_API_KEY: 'gemini-first' };
    const resolve = resolver(environment);
    const first = await resolve(request);
    environment.GEMINI_API_KEY = 'gemini-rotated';
    const second = await resolve(request);

    expect(second.headers).toEqual({ 'x-goog-api-key': 'google-deployment-key' });
    expect(second.binding).toBe(first.binding);
  });

  it('invalidates the credential binding when the active Gemini key rotates', async () => {
    const environment = { GEMINI_API_KEY: 'gemini-first' };
    const resolve = resolver(environment);
    const first = await resolve(request);
    environment.GEMINI_API_KEY = 'gemini-rotated';

    expect((await resolve(request)).binding).not.toBe(first.binding);
  });

  it('keeps user-provided credentials scoped to the user instead of using a deployment fallback', async () => {
    const lookup = jest.spyOn(repository, 'getStoredMediaCredential').mockResolvedValue({
      value: 'user-google-key',
      expiresAt: null,
      bindingRevision: 'user-key-revision',
    });
    const connection = await resolver({
      GOOGLE_KEY: 'user_provided',
      GEMINI_API_KEY: 'gemini-deployment-key',
    })(request);

    expect(connection.headers).toEqual({ 'x-goog-api-key': 'user-google-key' });
    expect(lookup).toHaveBeenCalledWith({ scope: request.scope, name: 'google' });
  });

  it('requires the user credential even when a Gemini deployment key is configured', async () => {
    await expect(
      resolver({ GOOGLE_KEY: 'user_provided', GEMINI_API_KEY: 'gemini-deployment-key' })(request),
    ).rejects.toMatchObject({ code: 'credentials_required' });
  });

  it('requires a key when neither environment variable is configured', async () => {
    await expect(resolver({})(request)).rejects.toMatchObject({ code: 'credentials_required' });
  });
});

describe('Vertex media connections', () => {
  const integration: MediaIntegration = {
    id: 'vertex-videos',
    api: 'google.vertex.videos',
    endpointRef: { kind: 'vertex', keyFile: '${GOOGLE_SERVICE_KEY_FILE}', location: 'us-central1' },
    catalog: { kind: 'configured', models: ['veo-3.1-fast-generate-001'] },
    operations: ['video.generate'],
  };
  const request = {
    scope: { ownerId: 'owner', tenantId: 'tenant' },
    integration,
    appConfig: {
      config: {},
      fileStrategy: FileSources.local,
      imageOutputType: 'png',
    } satisfies AppConfig,
    minValidityMs: 60_000,
  };
  function fixture() {
    let token = 'access-1';
    let revision = 'service-account-key-1';
    const boundary = {
      vertexCredentials: async () => ({ projectId: 'test-project', accessToken: token, revision }),
      getStoredMediaCredential: async () => null,
    };
    const resolve = createMediaCredentialResolver({
      environment: {
        GOOGLE_SERVICE_KEY_FILE: '/config/auth.json',
        GOOGLE_KEY: 'api-key',
        GEMINI_API_KEY: 'gemini-key',
      },
      repository: boundary,
      vertexCredentials: boundary.vertexCredentials,
      decrypt: async (value) => value,
      now: () => 0,
    });
    return {
      boundary,
      resolve,
      refresh: () => {
        token = 'access-2';
      },
      rotate: () => {
        revision = 'service-account-key-2';
      },
    };
  }

  it('uses the explicit service account instead of any configured API key', async () => {
    const { resolve, boundary } = fixture();
    const lookup = jest.spyOn(boundary, 'getStoredMediaCredential');
    const connection = await resolve(request);
    expect(connection.headers).toEqual({ Authorization: 'Bearer access-1' });
    expect(connection.baseURL).toBe(
      'https://us-central1-aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1/publishers/google/',
    );
    expect(lookup).not.toHaveBeenCalled();
  });

  it('keeps the binding across access-token refresh and changes it on key rotation', async () => {
    const { resolve, refresh, rotate } = fixture();
    const first = await resolve(request);
    refresh();
    const second = await resolve(request);
    expect(second.headers).not.toEqual(first.headers);
    expect(second.binding).toBe(first.binding);
    rotate();
    expect((await resolve(request)).binding).not.toBe(first.binding);
  });

  it('scopes the binding and URL to the configured location', async () => {
    const { resolve } = fixture();
    const first = await resolve(request);
    const changed = await resolve({
      ...request,
      integration: {
        ...integration,
        endpointRef: { kind: 'vertex', keyFile: '/config/auth.json', location: 'global' },
      },
    });
    expect(changed.binding).not.toBe(first.binding);
    expect(changed.baseURL).toContain('https://aiplatform.googleapis.com/');
    expect(changed.baseURL).toContain('/locations/global/');
  });

  it('passes resolved file paths, configured timeouts, and dispatch validity to the auth boundary', async () => {
    const boundary = {
      resolve: async () => ({ projectId: 'test-project', accessToken: 'token', revision: 'key' }),
    };
    const auth = jest.spyOn(boundary, 'resolve');
    const resolve = createMediaCredentialResolver({
      environment: { GOOGLE_SERVICE_KEY_FILE: '/config/auth.json' },
      repository: { getStoredMediaCredential: async () => null },
      decrypt: async (value) => value,
      now: () => 0,
      vertexCredentials: boundary.resolve,
    });
    await resolve(request);
    expect(auth).toHaveBeenCalledWith({
      keyFile: '/config/auth.json',
      projectId: undefined,
      minValidityMs: 60_000,
      timeoutMs: 10_000,
    });
  });

  it('does not silently use Gemini when Vertex authentication is unavailable', async () => {
    const resolve = createMediaCredentialResolver({
      environment: { GEMINI_API_KEY: 'gemini-key' },
      repository: { getStoredMediaCredential: async () => null },
      decrypt: async (value) => value,
      now: () => 0,
    });
    await expect(resolve(request)).rejects.toMatchObject({ code: 'not_ready' });
  });
});
