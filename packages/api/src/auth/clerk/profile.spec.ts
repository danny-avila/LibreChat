import { CLERK_PROFILE_TIMEOUT_MS, fetchClerkProfile } from './profile';
import { recordClerkProfileRequest } from '../../app/metrics';

jest.mock('../../app/metrics', () => ({
  recordClerkProfileRequest: jest.fn(),
}));

const recordClerkProfileRequestMock = jest.mocked(recordClerkProfileRequest);

const config = {
  enabled: true as const,
  publishableKey: 'pk_test_public',
  secretKey: 'sk_test_secret',
  jwtKey: 'test-public-key',
  authorizedParties: ['https://chat.example.com'] as readonly string[],
  webhookSigningSecret: 'whsec_test',
};

const validProfile = {
  id: 'user/123?',
  primary_email_address_id: 'email_primary',
  email_addresses: [
    {
      id: 'email_primary',
      email_address: '  User@Example.COM ',
      verification: { status: 'verified' },
    },
  ],
  first_name: ' Ada ',
  last_name: ' Lovelace ',
  username: ' ADA ',
  image_url: 'https://images.example.com/avatar.png',
};

type FetchTransport = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

describe('fetchClerkProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fetches the encoded subject and normalizes an explicitly verified primary email', async () => {
    const transport = jest.fn<ReturnType<FetchTransport>, Parameters<FetchTransport>>();
    transport.mockResolvedValue(jsonResponse(validProfile));

    const profile = await fetchClerkProfile('user/123?', config, transport);

    expect(transport).toHaveBeenCalledWith(
      'https://api.clerk.com/v1/users/user%2F123%3F',
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer sk_test_secret',
          'Clerk-API-Version': '2026-05-12',
        },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(profile).toEqual({
      email: 'user@example.com',
      emailVerified: true,
      name: 'Ada Lovelace',
      username: 'ada',
      avatarUrl: 'https://images.example.com/avatar.png',
    });
    expect(recordClerkProfileRequestMock).toHaveBeenCalledWith('success', expect.any(Number));
  });

  it('applies the five-second abort deadline to the outbound transport', async () => {
    const timeout = jest.spyOn(globalThis, 'setTimeout');
    const transport = jest.fn<ReturnType<FetchTransport>, Parameters<FetchTransport>>();
    transport.mockResolvedValue(jsonResponse(validProfile));

    await fetchClerkProfile(validProfile.id, config, transport);

    expect(timeout).toHaveBeenCalledWith(expect.any(Function), CLERK_PROFILE_TIMEOUT_MS);
    expect(CLERK_PROFILE_TIMEOUT_MS).toBe(5_000);
  });

  it('aborts an unresolved transport at the deadline without sleeping', async () => {
    jest.useFakeTimers();
    const transport = jest.fn<ReturnType<FetchTransport>, Parameters<FetchTransport>>();
    transport.mockImplementation((_input, init) => {
      const signal = init?.signal;
      if (!signal) {
        throw new Error('Expected an abort signal');
      }

      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });

    const rejection = fetchClerkProfile(validProfile.id, config, transport).catch(
      (error: unknown) => error,
    );
    await jest.advanceTimersByTimeAsync(CLERK_PROFILE_TIMEOUT_MS);

    await expect(rejection).resolves.toMatchObject({ code: 'CLERK_UNAVAILABLE', status: 503 });
  });

  it('omits unsafe optional profile fields without rejecting a verified identity', async () => {
    const transport = jest.fn<ReturnType<FetchTransport>, Parameters<FetchTransport>>();
    transport.mockResolvedValue(
      jsonResponse({
        ...validProfile,
        first_name: 42,
        last_name: null,
        username: '   ',
        image_url: 'file:///etc/passwd',
      }),
    );

    await expect(fetchClerkProfile(validProfile.id, config, transport)).resolves.toEqual({
      email: 'user@example.com',
      emailVerified: true,
    });
  });

  it.each([
    [
      'unverified',
      {
        ...validProfile,
        email_addresses: [
          { ...validProfile.email_addresses[0], verification: { status: 'unverified' } },
        ],
      },
    ],
    [
      'missing verification',
      {
        ...validProfile,
        email_addresses: [{ id: 'email_primary', email_address: 'user@example.com' }],
      },
    ],
    ['missing primary email', { ...validProfile, primary_email_address_id: null }],
  ])('forbids a well-formed profile with %s', async (_case, responseBody) => {
    const transport = jest.fn<ReturnType<FetchTransport>, Parameters<FetchTransport>>();
    transport.mockResolvedValue(jsonResponse(responseBody));

    await expect(fetchClerkProfile(validProfile.id, config, transport)).rejects.toMatchObject({
      code: 'CLERK_LOGIN_FORBIDDEN',
      status: 403,
    });
    expect(recordClerkProfileRequestMock).toHaveBeenCalledWith('forbidden', expect.any(Number));
  });

  it.each([
    ['a non-object body', []],
    ['a mismatched subject', { ...validProfile, id: 'different_user' }],
    ['a non-array email list', { ...validProfile, email_addresses: {} }],
    [
      'an unresolved primary email reference',
      { ...validProfile, primary_email_address_id: 'missing' },
    ],
    [
      'a malformed primary email value',
      {
        ...validProfile,
        email_addresses: [{ ...validProfile.email_addresses[0], email_address: 42 }],
      },
    ],
  ])('maps %s to an unavailable upstream', async (_case, responseBody) => {
    const transport = jest.fn<ReturnType<FetchTransport>, Parameters<FetchTransport>>();
    transport.mockResolvedValue(jsonResponse(responseBody));

    await expect(fetchClerkProfile(validProfile.id, config, transport)).rejects.toMatchObject({
      code: 'CLERK_UNAVAILABLE',
      status: 503,
    });
  });

  it('maps malformed JSON to an unavailable upstream', async () => {
    const transport = jest.fn<ReturnType<FetchTransport>, Parameters<FetchTransport>>();
    transport.mockResolvedValue(new Response('{not-json', { status: 200 }));

    await expect(fetchClerkProfile(validProfile.id, config, transport)).rejects.toMatchObject({
      code: 'CLERK_UNAVAILABLE',
      status: 503,
    });
  });

  it.each([404, 410])(
    'maps an absent profile response (%s) to an invalid token',
    async (status) => {
      const transport = jest.fn<ReturnType<FetchTransport>, Parameters<FetchTransport>>();
      transport.mockResolvedValue(jsonResponse({ error: 'missing' }, status));

      await expect(fetchClerkProfile(validProfile.id, config, transport)).rejects.toMatchObject({
        code: 'CLERK_TOKEN_INVALID',
        status: 401,
      });
      expect(recordClerkProfileRequestMock).toHaveBeenCalledWith('not_found', expect.any(Number));
    },
  );

  it('maps upstream throttling and clamps an integer Retry-After header', async () => {
    const transport = jest.fn<ReturnType<FetchTransport>, Parameters<FetchTransport>>();
    transport.mockResolvedValue(
      jsonResponse({ error: 'rate limited' }, 429, { 'Retry-After': '120' }),
    );

    await expect(fetchClerkProfile(validProfile.id, config, transport)).rejects.toMatchObject({
      code: 'CLERK_UPSTREAM_RATE_LIMITED',
      status: 429,
      retryAfterSeconds: 60,
    });
    expect(recordClerkProfileRequestMock).toHaveBeenCalledWith('rate_limited', expect.any(Number));
  });

  it('discards a non-integer upstream Retry-After header', async () => {
    const transport = jest.fn<ReturnType<FetchTransport>, Parameters<FetchTransport>>();
    transport.mockResolvedValue(
      jsonResponse({ error: 'rate limited' }, 429, { 'Retry-After': 'tomorrow' }),
    );

    await expect(fetchClerkProfile(validProfile.id, config, transport)).rejects.toMatchObject({
      code: 'CLERK_UPSTREAM_RATE_LIMITED',
      status: 429,
      retryAfterSeconds: undefined,
    });
  });

  it.each([500, 502, 503])('maps upstream %s responses to unavailable', async (status) => {
    const transport = jest.fn<ReturnType<FetchTransport>, Parameters<FetchTransport>>();
    transport.mockResolvedValue(jsonResponse({ error: 'upstream' }, status));

    await expect(fetchClerkProfile(validProfile.id, config, transport)).rejects.toMatchObject({
      code: 'CLERK_UNAVAILABLE',
      status: 503,
    });
    expect(recordClerkProfileRequestMock).toHaveBeenCalledWith('unavailable', expect.any(Number));
  });

  it.each([new TypeError('network failed'), new DOMException('request timed out', 'AbortError')])(
    'maps transport failures to unavailable without leaking details',
    async (transportError) => {
      const transport = jest.fn<ReturnType<FetchTransport>, Parameters<FetchTransport>>();
      transport.mockRejectedValue(transportError);

      await expect(fetchClerkProfile(validProfile.id, config, transport)).rejects.toMatchObject({
        code: 'CLERK_UNAVAILABLE',
        status: 503,
        message: 'Clerk authentication failed',
      });
    },
  );
});
