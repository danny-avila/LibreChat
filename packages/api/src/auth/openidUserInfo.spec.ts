import type { OpenIdRuntimeConfig } from './openidUserInfo';
import type { OpenIdAccountClaims } from './openidAccount';
import { enrichOpenIdProfile } from './openidUserInfo';

const claims: OpenIdAccountClaims = {
  sub: 'sub-123',
  email: 'claims@example.com',
  preferred_username: 'claims-user',
};

const config: OpenIdRuntimeConfig = {
  issuer: 'https://issuer.example.com/tenant/v2.0',
  clientId: 'client-id',
  clientSecret: 'client-secret',
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return {
    ok: init.status == null || (init.status >= 200 && init.status < 300),
    status: init.status ?? 200,
    json: jest.fn(async () => body),
    release: jest.fn(),
  } as Partial<Response> as Response;
}

function fetcher(responses: Response[]): typeof fetch {
  return jest.fn(async () => {
    const response = responses.shift();
    if (!response) {
      throw new Error('unexpected fetch');
    }
    return response;
  }) as unknown as jest.MockedFunction<typeof fetch>;
}

function restoreEnvValue(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

describe('enrichOpenIdProfile', () => {
  const originalOboRequired = process.env.OPENID_ON_BEHALF_FLOW_FOR_USERINFO_REQUIRED;
  const originalOboScope = process.env.OPENID_ON_BEHALF_FLOW_USERINFO_SCOPE;

  beforeEach(() => {
    delete process.env.OPENID_ON_BEHALF_FLOW_FOR_USERINFO_REQUIRED;
    delete process.env.OPENID_ON_BEHALF_FLOW_USERINFO_SCOPE;
  });

  afterAll(() => {
    restoreEnvValue('OPENID_ON_BEHALF_FLOW_FOR_USERINFO_REQUIRED', originalOboRequired);
    restoreEnvValue('OPENID_ON_BEHALF_FLOW_USERINFO_SCOPE', originalOboScope);
  });

  it('returns claims-only profile when userinfo is disabled', async () => {
    const fetchMock = fetcher([]);

    const result = await enrichOpenIdProfile({
      claims,
      subject: 'sub-123',
      config,
      fetchUserInfo: false,
      fetcher: fetchMock,
    });

    expect(result).toEqual({ status: 'skipped', profile: claims, reason: 'disabled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns claims-only profile when access token is missing', async () => {
    const fetchMock = fetcher([]);

    const result = await enrichOpenIdProfile({
      claims,
      subject: 'sub-123',
      config,
      fetchUserInfo: true,
      fetcher: fetchMock,
    });

    expect(result).toEqual({
      status: 'skipped',
      profile: claims,
      reason: 'missing_access_token',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches userinfo and merges it over claims', async () => {
    const fetchMock = fetcher([
      jsonResponse({ userinfo_endpoint: 'https://issuer.example.com/userinfo' }),
      jsonResponse({
        sub: 'sub-123',
        email: 'userinfo@example.com',
        preferred_username: 'userinfo-user',
        name: 'User Info',
      }),
    ]);

    const result = await enrichOpenIdProfile({
      claims,
      accessToken: 'access-token',
      subject: 'sub-123',
      config,
      fetchUserInfo: true,
      fetcher: fetchMock,
    });

    expect(result).toEqual({
      status: 'fetched',
      profile: {
        sub: 'sub-123',
        email: 'userinfo@example.com',
        preferred_username: 'userinfo-user',
        name: 'User Info',
      },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://issuer.example.com/tenant/v2.0/.well-known/openid-configuration',
      { method: 'GET' },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://issuer.example.com/userinfo', {
      method: 'GET',
      headers: { authorization: 'Bearer access-token' },
    });
  });

  it('does not duplicate the discovery path when issuer is already a discovery URL', async () => {
    const fetchMock = fetcher([
      jsonResponse({ userinfo_endpoint: 'https://issuer.example.com/userinfo' }),
      jsonResponse({ sub: 'sub-123', email: 'userinfo@example.com' }),
    ]);

    await enrichOpenIdProfile({
      claims,
      accessToken: 'access-token',
      subject: 'sub-123',
      config: {
        ...config,
        issuer: 'https://issuer.example.com/tenant/v2.0/.well-known/openid-configuration',
      },
      fetchUserInfo: true,
      fetcher: fetchMock,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://issuer.example.com/tenant/v2.0/.well-known/openid-configuration',
      { method: 'GET' },
    );
  });

  it('exchanges the request token before userinfo when OBO is required', async () => {
    process.env.OPENID_ON_BEHALF_FLOW_FOR_USERINFO_REQUIRED = 'true';
    process.env.OPENID_ON_BEHALF_FLOW_USERINFO_SCOPE = 'custom.userinfo';
    const fetchMock = fetcher([
      jsonResponse({
        token_endpoint: 'https://issuer.example.com/token',
        userinfo_endpoint: 'https://issuer.example.com/userinfo',
      }),
      jsonResponse({ access_token: 'exchanged-token', expires_in: 3600 }),
      jsonResponse({
        sub: 'sub-123',
        email: 'userinfo@example.com',
      }),
    ]);

    const result = await enrichOpenIdProfile({
      claims,
      accessToken: 'remote-api-token',
      subject: 'sub-123',
      config,
      fetchUserInfo: true,
      fetcher: fetchMock,
    });

    expect(result).toEqual({
      status: 'fetched',
      profile: {
        sub: 'sub-123',
        email: 'userinfo@example.com',
        preferred_username: 'claims-user',
      },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://issuer.example.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: expect.any(URLSearchParams),
    });
    const tokenRequest = (fetchMock as jest.MockedFunction<typeof fetch>).mock.calls[1][1]
      ?.body as URLSearchParams;
    expect(Object.fromEntries(tokenRequest.entries())).toEqual({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      scope: 'custom.userinfo',
      assertion: 'remote-api-token',
      requested_token_use: 'on_behalf_of',
      client_id: 'client-id',
      client_secret: 'client-secret',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'https://issuer.example.com/userinfo', {
      method: 'GET',
      headers: { authorization: 'Bearer exchanged-token' },
    });
  });

  it('rejects unsafe discovered userinfo endpoints before sending the access token', async () => {
    const fetchMock = fetcher([
      jsonResponse({ userinfo_endpoint: 'http://metadata.internal/userinfo' }),
    ]);

    const result = await enrichOpenIdProfile({
      claims,
      accessToken: 'access-token',
      subject: 'sub-123',
      config,
      fetchUserInfo: true,
      fetcher: fetchMock,
    });

    expect(result).toEqual({
      status: 'failed',
      profile: claims,
      reason: 'service_error',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects unsafe discovered token endpoints before OBO exchange', async () => {
    process.env.OPENID_ON_BEHALF_FLOW_FOR_USERINFO_REQUIRED = 'true';
    const fetchMock = fetcher([
      jsonResponse({
        token_endpoint: 'http://metadata.internal/token',
        userinfo_endpoint: 'https://issuer.example.com/userinfo',
      }),
    ]);

    const result = await enrichOpenIdProfile({
      claims,
      accessToken: 'remote-api-token',
      subject: 'sub-123',
      config,
      fetchUserInfo: true,
      fetcher: fetchMock,
    });

    expect(result).toEqual({
      status: 'failed',
      profile: claims,
      reason: 'service_error',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('classifies OBO exchange failures as service errors', async () => {
    process.env.OPENID_ON_BEHALF_FLOW_FOR_USERINFO_REQUIRED = 'true';

    const result = await enrichOpenIdProfile({
      claims,
      accessToken: 'remote-api-token',
      subject: 'sub-123',
      config,
      fetchUserInfo: true,
      fetcher: fetcher([
        jsonResponse({
          token_endpoint: 'https://issuer.example.com/token',
          userinfo_endpoint: 'https://issuer.example.com/userinfo',
        }),
        jsonResponse({}, { status: 400 }),
      ]),
    });

    expect(result).toEqual({
      status: 'failed',
      profile: claims,
      reason: 'service_error',
    });
  });

  it('classifies userinfo unauthorized responses', async () => {
    const result = await enrichOpenIdProfile({
      claims,
      accessToken: 'access-token',
      subject: 'sub-123',
      config,
      fetchUserInfo: true,
      fetcher: fetcher([
        jsonResponse({ userinfo_endpoint: 'https://issuer.example.com/userinfo' }),
        jsonResponse({}, { status: 401 }),
      ]),
    });

    expect(result).toEqual({
      status: 'failed',
      profile: claims,
      reason: 'unauthorized',
    });
  });

  it('supports standard fetch-compatible error responses without release', async () => {
    const unauthorizedResponse = {
      ok: false,
      status: 401,
      json: jest.fn(),
    } as Partial<Response> as Response;

    const result = await enrichOpenIdProfile({
      claims,
      accessToken: 'access-token',
      subject: 'sub-123',
      config,
      fetchUserInfo: true,
      fetcher: fetcher([
        jsonResponse({ userinfo_endpoint: 'https://issuer.example.com/userinfo' }),
        unauthorizedResponse,
      ]),
    });

    expect(result).toEqual({
      status: 'failed',
      profile: claims,
      reason: 'unauthorized',
    });
  });

  it('classifies subject mismatches separately from service failures', async () => {
    const result = await enrichOpenIdProfile({
      claims,
      accessToken: 'access-token',
      subject: 'sub-123',
      config,
      fetchUserInfo: true,
      fetcher: fetcher([
        jsonResponse({ userinfo_endpoint: 'https://issuer.example.com/userinfo' }),
        jsonResponse({ sub: 'other-sub', email: 'userinfo@example.com' }),
      ]),
    });

    expect(result).toEqual({
      status: 'failed',
      profile: claims,
      reason: 'subject_mismatch',
    });
  });

  it('classifies discovery and userinfo service errors', async () => {
    const discoveryFailure = await enrichOpenIdProfile({
      claims,
      accessToken: 'access-token',
      subject: 'sub-123',
      config,
      fetchUserInfo: true,
      fetcher: fetcher([jsonResponse({}, { status: 500 })]),
    });
    const userInfoFailure = await enrichOpenIdProfile({
      claims,
      accessToken: 'access-token',
      subject: 'sub-123',
      config,
      fetchUserInfo: true,
      fetcher: fetcher([
        jsonResponse({ userinfo_endpoint: 'https://issuer.example.com/userinfo' }),
        jsonResponse({}, { status: 500 }),
      ]),
    });

    expect(discoveryFailure).toEqual({
      status: 'failed',
      profile: claims,
      reason: 'service_error',
    });
    expect(userInfoFailure).toEqual({
      status: 'failed',
      profile: claims,
      reason: 'service_error',
    });
  });

  it('returns service_error with the thrown error for network or malformed JSON failures', async () => {
    const error = new Error('network failed');
    const fetchMock = jest.fn(async () => {
      throw error;
    }) as unknown as jest.MockedFunction<typeof fetch>;

    const result = await enrichOpenIdProfile({
      claims,
      accessToken: 'access-token',
      subject: 'sub-123',
      config,
      fetchUserInfo: true,
      fetcher: fetchMock,
    });

    expect(result).toEqual({
      status: 'failed',
      profile: claims,
      reason: 'service_error',
      error,
    });
  });
});
