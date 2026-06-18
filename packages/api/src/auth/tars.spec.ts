jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

import { authenticateTars } from './tars';

const BASE_URL = 'http://tars.test';

const buildResponse = (status: number, body: unknown): Response =>
  ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }) as Response;

describe('authenticateTars', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws when no base URL is configured', async () => {
    await expect(authenticateTars('jdoe', 'pw', undefined)).rejects.toThrow('TARS_AUTH_URL');
  });

  it('posts username/password to the pwc_tars login endpoint', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      buildResponse(200, {
        token: 't',
        user: { id: 'u1', username: 'jdoe', email: 'jdoe@example.com', display_name: 'John' },
      }),
    );

    const user = await authenticateTars('jdoe', 'secret', BASE_URL);

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/auth/login`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'jdoe', password: 'secret', use_sso: false }),
      }),
    );
    expect(user).toEqual({
      id: 'u1',
      username: 'jdoe',
      email: 'jdoe@example.com',
      name: 'John',
      avatar: undefined,
    });
  });

  it('falls back to username when display_name is absent', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      buildResponse(200, {
        user: { id: 'u1', username: 'jdoe', email: 'jdoe@example.com' },
      }),
    );

    const user = await authenticateTars('jdoe', 'secret', BASE_URL);
    expect(user?.name).toBe('jdoe');
  });

  it('returns null on 401', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(buildResponse(401, { message: 'bad' }));
    await expect(authenticateTars('jdoe', 'wrong', BASE_URL)).resolves.toBeNull();
  });

  it('returns null on 403', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(buildResponse(403, { message: 'disabled' }));
    await expect(authenticateTars('jdoe', 'pw', BASE_URL)).resolves.toBeNull();
  });

  it('returns null when the response lacks a user', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(buildResponse(200, { token: 't' }));
    await expect(authenticateTars('jdoe', 'pw', BASE_URL)).resolves.toBeNull();
  });

  it('throws on unexpected non-ok status', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(buildResponse(500, {}));
    await expect(authenticateTars('jdoe', 'pw', BASE_URL)).rejects.toThrow('status 500');
  });

  it('propagates connection errors', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(authenticateTars('jdoe', 'pw', BASE_URL)).rejects.toThrow('ECONNREFUSED');
  });
});
