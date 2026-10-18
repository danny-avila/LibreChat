import { PrincipalType } from 'librechat-data-provider';

interface FakeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<object>;
}

interface FakeCall {
  url: string;
  method: string;
  body?: string;
}

const mockCalls: FakeCall[] = [];
let mockRoutes: Array<[RegExp, (call: FakeCall) => [number, object]]> = [];

function mockReply(status: number, body: object): FakeResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

jest.mock('../utils/api', () => ({
  apiFetch: jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const call = { url, method: init?.method ?? 'GET', body: init?.body };
    mockCalls.push(call);
    const route = mockRoutes.find(([pattern]) => pattern.test(`${call.method} ${url}`));
    if (!route) return mockReply(404, { error: 'not found' });
    return mockReply(...route[1](call));
  }),
}));

jest.mock('../capabilities', () => ({
  requireAnyCapability: jest.fn(async () => undefined),
  requireCapability: jest.fn(async () => undefined),
  requireAllSectionCapabilities: jest.fn(async () => undefined),
}));

import { createScopeFn, getAvailableScopesFn } from './read';

const BOB = '6ac3e10890468262c2267093';
const ENG = '6ac3e10d90468262c22670b0';

const configs = [
  {
    _id: 'base',
    principalType: 'role',
    principalId: '__base__',
    priority: 0,
    isActive: true,
    overrides: { balance: { startBalance: 1 } },
  },
  {
    _id: 'c-user',
    principalType: 'user',
    principalId: BOB,
    priority: 100,
    isActive: true,
    overrides: { interface: { parameters: false } },
    tombstones: ['balance.startBalance'],
  },
  {
    _id: 'c-eng',
    principalType: 'group',
    principalId: ENG,
    priority: 20,
    isActive: false,
    overrides: { mcpServers: { docs: { type: 'sse', url: 'https://d' } }, actions: {} },
  },
  {
    _id: 'c-role',
    principalType: 'role',
    principalId: 'USER',
    priority: 10,
    isActive: true,
    overrides: {
      endpoints: {
        custom: [
          { name: 'Claude', modelDisplayLabel: 'Claude (USER)' },
          { name: 'Gemini', iconURL: 'https://g.example/i.png' },
        ],
      },
    },
  },
];

function userPage(offset: number) {
  const filler = Array.from({ length: 200 }, (_, i) => ({
    id: `filler-${offset + i}`,
    name: `Filler ${i}`,
    email: `f${i}@x`,
  }));
  return offset === 0
    ? { users: filler, total: 201 }
    : { users: [{ id: BOB, name: 'Bob Test', email: 'bob@test.local' }], total: 201 };
}

beforeEach(() => {
  mockCalls.length = 0;
  mockRoutes = [
    [/^GET \/api\/admin\/config$/, () => [200, { configs }]],
    [
      /^GET \/api\/admin\/groups\?/,
      () => [
        200,
        { groups: [{ _id: ENG, name: 'Engineering', memberIds: ['a', 'b', 'c'] }], total: 1 },
      ],
    ],
    [
      /^GET \/api\/admin\/users\?/,
      (call) => [200, userPage(Number(new URL(call.url, 'http://x').searchParams.get('offset')))],
    ],
    [/^GET \/api\/admin\/roles\/USER\/members/, () => [200, { members: [], total: 7 }]],
  ];
});

describe('getAvailableScopesFn', () => {
  it('names users with their email, counts members and lists override paths and entries', async () => {
    const { scopes } = await getAvailableScopesFn();
    expect(scopes).toEqual([
      {
        _id: 'c-user',
        principalType: 'user',
        principalId: BOB,
        name: 'Bob Test',
        email: 'bob@test.local',
        priority: 100,
        isActive: true,
        overridePaths: ['interface.parameters'],
        overrideEntries: {},
        tombstones: ['balance.startBalance'],
      },
      {
        _id: 'c-eng',
        principalType: 'group',
        principalId: ENG,
        name: 'Engineering',
        memberCount: 3,
        priority: 20,
        isActive: false,
        overridePaths: ['mcpServers.docs.type', 'mcpServers.docs.url'],
        overrideEntries: {},
        tombstones: [],
      },
      {
        _id: 'c-role',
        principalType: 'role',
        principalId: 'USER',
        name: 'USER',
        memberCount: 7,
        priority: 10,
        isActive: true,
        overridePaths: ['endpoints.custom'],
        overrideEntries: { 'endpoints.custom': ['Claude', 'Gemini'] },
        tombstones: [],
      },
    ]);
    const userPages = mockCalls.filter((c) => c.url.startsWith('/api/admin/users'));
    expect(userPages.map((c) => c.url)).toEqual([
      '/api/admin/users?limit=200&offset=0',
      '/api/admin/users?limit=200&offset=200',
    ]);
  });

  it('falls back to the principal id when the directory cannot be read', async () => {
    mockRoutes = mockRoutes.map(([pattern, handler]) =>
      pattern.source.includes('users') || pattern.source.includes('groups')
        ? [pattern, () => [403, { error: 'Insufficient permissions' }]]
        : [pattern, handler],
    );
    const { scopes } = await getAvailableScopesFn();
    expect(scopes.map((s) => s.name)).toEqual([BOB, ENG, 'USER']);
    expect(scopes[0].email).toBeUndefined();
  });

  it('skips the directory entirely when there are no user or group profiles', async () => {
    mockRoutes[0] = [/^GET \/api\/admin\/config$/, () => [200, { configs: [configs[3]] }]];
    await getAvailableScopesFn();
    expect(mockCalls.some((c) => /users|groups/.test(c.url))).toBe(false);
  });
});

describe('createScopeFn', () => {
  it.each([
    [PrincipalType.ROLE, 'USER', 10],
    [PrincipalType.GROUP, ENG, 20],
    [PrincipalType.USER, BOB, 100],
  ])('creates a %s profile at the documented default priority', async (type, id, priority) => {
    mockRoutes.push([/^GET \/api\/admin\/roles\//, () => [200, { role: { name: id } }]]);
    mockRoutes.push([
      /^PUT \/api\/admin\/config\//,
      (call) => [
        201,
        {
          config: {
            _id: 'new',
            principalType: type,
            principalId: id,
            priority: JSON.parse(call.body ?? '{}').priority,
            isActive: true,
            overrides: {},
          },
        },
      ],
    ]);
    const { scope } = await createScopeFn({
      data: { principalType: type, principalId: id, name: 'Name' },
    });
    const put = mockCalls.find((c) => c.method === 'PUT');
    expect(JSON.parse(put?.body ?? '{}')).toEqual({ overrides: {}, priority });
    expect(scope).toMatchObject({ _id: 'new', name: 'Name', priority, principalId: id });
  });

  it('refuses a profile for a role that does not exist', async () => {
    await expect(
      createScopeFn({
        data: { principalType: PrincipalType.ROLE, principalId: 'NO_SUCH_ROLE', name: 'X' },
      }),
    ).rejects.toThrow('There is no role named "NO_SUCH_ROLE"');
    expect(mockCalls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('returns an existing profile instead of replacing its overrides', async () => {
    mockRoutes.push([/^GET \/api\/admin\/config\/group\//, () => [200, { config: configs[2] }]]);
    const { scope } = await createScopeFn({
      data: { principalType: PrincipalType.GROUP, principalId: ENG, name: 'Engineering' },
    });
    expect(mockCalls.some((c) => c.method === 'PUT')).toBe(false);
    expect(scope).toMatchObject({ _id: 'c-eng', priority: 20, isActive: false });
  });
});
