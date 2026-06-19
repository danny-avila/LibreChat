jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

import {
  authenticateTars,
  isTarsAdminRole,
  hasTarsMenuAccess,
  flattenTarsMenuKeys,
  parseTarsAdminRoleIds,
} from './tars';
import type { TarsMenuItem } from './tars';

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

  it('posts username/password and captures the full authorization context', async () => {
    const menuItems = [{ id: 100, dom_id: 'chat-application', url: null, children: [] }];
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      buildResponse(200, {
        token: 't',
        user: {
          id: 'u1',
          username: 'jdoe',
          email: 'jdoe@example.com',
          display_name: 'John',
          status: 'active',
          role_id: 1,
          user_group_id: 'g1,g2',
        },
        menu_items: menuItems,
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
      status: 'active',
      roleId: 1,
      groupIds: 'g1,g2',
      menuItems,
    });
  });

  it('defaults name to username, status to active, role/group to null, menu to []', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      buildResponse(200, {
        user: { id: 'u1', username: 'jdoe', email: 'jdoe@example.com' },
      }),
    );

    const user = await authenticateTars('jdoe', 'secret', BASE_URL);
    expect(user).toMatchObject({
      name: 'jdoe',
      status: 'active',
      roleId: null,
      groupIds: null,
      menuItems: [],
    });
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

describe('flattenTarsMenuKeys', () => {
  it('collects dom_id and url recursively, deduped, skipping empties', () => {
    const items: TarsMenuItem[] = [
      {
        id: 100,
        dom_id: 'chat-application',
        url: null,
        children: [
          { id: 110, dom_id: 'dashboard', url: '/dashboard' },
          {
            id: 150,
            dom_id: 'advanced',
            url: null,
            children: [{ id: 151, dom_id: 'agent', url: '/domain/150' }],
          },
        ],
      },
    ];
    const keys = flattenTarsMenuKeys(items);
    expect(keys).toEqual(
      expect.arrayContaining([
        'chat-application',
        'dashboard',
        '/dashboard',
        'advanced',
        'agent',
        '/domain/150',
      ]),
    );
    expect(keys).toHaveLength(6);
  });

  it('returns [] for empty input', () => {
    expect(flattenTarsMenuKeys([])).toEqual([]);
  });
});

describe('parseTarsAdminRoleIds', () => {
  it('defaults to [1] when unset or blank', () => {
    expect(parseTarsAdminRoleIds(undefined)).toEqual([1]);
    expect(parseTarsAdminRoleIds('   ')).toEqual([1]);
  });

  it('parses a comma list and ignores non-numeric entries', () => {
    expect(parseTarsAdminRoleIds('1,5, 7')).toEqual([1, 5, 7]);
    expect(parseTarsAdminRoleIds('a,b')).toEqual([1]);
  });
});

describe('isTarsAdminRole', () => {
  it('matches against the provided admin role ids', () => {
    expect(isTarsAdminRole(1, [1])).toBe(true);
    expect(isTarsAdminRole(99, [1])).toBe(false);
    expect(isTarsAdminRole(null, [1])).toBe(false);
    expect(isTarsAdminRole(5, [1, 5])).toBe(true);
  });
});

describe('hasTarsMenuAccess', () => {
  it('checks membership in the stored menu keys', () => {
    expect(hasTarsMenuAccess(['/dashboard', 'agent'], 'agent')).toBe(true);
    expect(hasTarsMenuAccess(['/dashboard'], '/knowledge/list')).toBe(false);
    expect(hasTarsMenuAccess(undefined, 'agent')).toBe(false);
  });
});
