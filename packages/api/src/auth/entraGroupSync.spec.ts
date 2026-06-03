import { Types } from 'mongoose';
import { logger } from '@librechat/data-schemas';
import type { IGroup, IUser, UserGroupMethods } from '@librechat/data-schemas';

import { syncUserEntraGroupMemberships } from './entraGroupSync';
import type {
  EntraGroupSyncDbMethods,
  EntraGraphConfig,
  EntraGroupSyncOptions,
  EntraGroupSyncResult,
} from './entraGroupSync';

const graphConfig: EntraGraphConfig = {
  issuer: 'https://issuer.example.com/tenant/v2.0',
  clientId: 'client-id',
  clientSecret: 'client-secret',
  useEntraIdForPeopleSearch: true,
};

const options: EntraGroupSyncOptions = {
  syncGroupsOnCreate: true,
  syncGroupsForExisting: true,
};

const updateResult = {
  acknowledged: true,
  matchedCount: 0,
  modifiedCount: 0,
  upsertedCount: 0,
  upsertedId: null,
};

function mockMethod<T extends (...args: never[]) => unknown>(
  implementation: T,
): jest.MockedFunction<T> {
  const typedImplementation = implementation as unknown as (
    ...args: Parameters<T>
  ) => ReturnType<T>;
  return jest.fn<ReturnType<T>, Parameters<T>>(
    typedImplementation,
  ) as unknown as jest.MockedFunction<T>;
}

function user(overrides: Partial<IUser> = {}): IUser {
  const _id = new Types.ObjectId();
  return {
    _id,
    id: _id.toString(),
    email: 'user@example.com',
    provider: 'openid',
    openidId: 'sub-123',
    idOnTheSource: 'oid-123',
    ...overrides,
  } as IUser;
}

function methods(overrides: Partial<EntraGroupSyncDbMethods> = {}): EntraGroupSyncDbMethods {
  return {
    bulkUpdateGroups: mockMethod<UserGroupMethods['bulkUpdateGroups']>(async () => updateResult),
    findGroupsByExternalIds: mockMethod<UserGroupMethods['findGroupsByExternalIds']>(
      async () => [],
    ),
    upsertGroupByExternalId: mockMethod<UserGroupMethods['upsertGroupByExternalId']>(
      async () => null,
    ),
    ...overrides,
  };
}

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

async function sync(
  overrides: {
    lifecycle?: 'created' | 'existing';
    user?: IUser;
    accessToken?: string;
    graphConfig?: EntraGraphConfig;
    options?: EntraGroupSyncOptions;
    methods?: EntraGroupSyncDbMethods;
    fetcher?: typeof fetch;
  } = {},
): Promise<EntraGroupSyncResult> {
  return syncUserEntraGroupMemberships({
    lifecycle: overrides.lifecycle ?? 'existing',
    user: overrides.user ?? user(),
    accessToken: Object.prototype.hasOwnProperty.call(overrides, 'accessToken')
      ? overrides.accessToken
      : 'remote-api-token',
    graphConfig: overrides.graphConfig ?? graphConfig,
    options: overrides.options ?? options,
    methods: overrides.methods ?? methods(),
    fetcher: overrides.fetcher ?? fetcher([]),
  });
}

describe('syncUserEntraGroupMemberships', () => {
  it('skips when the lifecycle flag is disabled', async () => {
    const deps = methods();
    const fetchMock = fetcher([]);

    const result = await sync({
      lifecycle: 'created',
      options: { ...options, syncGroupsOnCreate: false, syncGroupsForExisting: true },
      methods: deps,
      fetcher: fetchMock,
    });

    expect(result).toEqual({ attempted: false, synced: false, reason: 'disabled' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(deps.bulkUpdateGroups).not.toHaveBeenCalled();
  });

  it('skips when graph feature config or user identity prerequisites are missing', async () => {
    await expect(
      sync({ graphConfig: { ...graphConfig, useEntraIdForPeopleSearch: false } }),
    ).resolves.toEqual({ attempted: false, synced: false, reason: 'disabled' });
    await expect(sync({ user: user({ provider: 'local' }) })).resolves.toEqual({
      attempted: false,
      synced: false,
      reason: 'not_openid',
    });
    await expect(sync({ user: user({ idOnTheSource: undefined }) })).resolves.toEqual({
      attempted: false,
      synced: false,
      reason: 'missing_user_identity',
    });
    await expect(sync({ accessToken: undefined })).resolves.toEqual({
      attempted: false,
      synced: false,
      reason: 'missing_access_token',
    });
  });

  it('exchanges the request token and syncs existing, missing, owned, and stale groups', async () => {
    const existingGroup = { idOnTheSource: 'group-a' } as IGroup;
    const deps = methods({
      findGroupsByExternalIds: mockMethod<UserGroupMethods['findGroupsByExternalIds']>(async () => [
        existingGroup,
      ]),
    });
    const fetchMock = fetcher([
      jsonResponse({ token_endpoint: 'https://issuer.example.com/token' }),
      jsonResponse({ access_token: 'graph-token', expires_in: 3600 }),
      jsonResponse({ value: ['group-a', 'group-b'] }),
      jsonResponse({ value: [{ id: 'group-c' }] }),
      jsonResponse({
        responses: [
          {
            id: 'group-b',
            status: 200,
            body: {
              id: 'group-b',
              displayName: 'Group B',
              mail: 'GROUPB@EXAMPLE.COM',
              description: 'B',
            },
          },
          {
            id: 'group-c',
            status: 200,
            body: { id: 'group-c', displayName: 'Group C' },
          },
        ],
      }),
    ]);

    const result = await sync({
      graphConfig: { ...graphConfig, includeOwnersAsMembers: true },
      methods: deps,
      fetcher: fetchMock,
    });

    expect(result).toMatchObject({ attempted: true, synced: true });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://issuer.example.com/tenant/v2.0/.well-known/openid-configuration',
      { method: 'GET' },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://issuer.example.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: expect.any(URLSearchParams),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://graph.microsoft.com/v1.0/me/getMemberGroups',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer graph-token' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://graph.microsoft.com/v1.0/me/ownedObjects/microsoft.graph.group?$select=id&$top=999',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ authorization: 'Bearer graph-token' }),
      }),
    );
    expect(deps.bulkUpdateGroups).toHaveBeenNthCalledWith(
      1,
      {
        idOnTheSource: { $in: ['group-a', 'group-b', 'group-c'] },
        source: 'entra',
        memberIds: { $ne: 'oid-123' },
      },
      { $addToSet: { memberIds: 'oid-123' } },
    );
    expect(deps.upsertGroupByExternalId).toHaveBeenCalledWith(
      'group-b',
      'entra',
      { name: 'Group B', email: 'groupb@example.com', description: 'B' },
      undefined,
    );
    expect(deps.upsertGroupByExternalId).toHaveBeenCalledWith(
      'group-c',
      'entra',
      { name: 'Group C', email: undefined, description: undefined },
      undefined,
    );
    expect(deps.bulkUpdateGroups).toHaveBeenLastCalledWith(
      {
        source: 'entra',
        memberIds: 'oid-123',
        idOnTheSource: { $nin: ['group-a', 'group-b', 'group-c'] },
      },
      { $pullAll: { memberIds: ['oid-123'] } },
    );
  });

  it('does not duplicate the discovery path when issuer is already a discovery URL', async () => {
    const deps = methods();
    const fetchMock = fetcher([
      jsonResponse({ token_endpoint: 'https://issuer.example.com/token' }),
      jsonResponse({ access_token: 'graph-token' }),
      jsonResponse({ value: ['group-a'] }),
      jsonResponse({
        responses: [
          {
            id: 'group-a',
            status: 200,
            body: { id: 'group-a', displayName: 'Group A' },
          },
        ],
      }),
    ]);

    await sync({
      graphConfig: {
        ...graphConfig,
        issuer: 'https://issuer.example.com/tenant/v2.0/.well-known/openid-configuration',
      },
      methods: deps,
      fetcher: fetchMock,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://issuer.example.com/tenant/v2.0/.well-known/openid-configuration',
      { method: 'GET' },
    );
  });

  it('retries throttled group detail batch entries before syncing missing groups', async () => {
    jest.useFakeTimers();
    const deps = methods();
    const syncPromise = sync({
      methods: deps,
      fetcher: fetcher([
        jsonResponse({ token_endpoint: 'https://issuer.example.com/token' }),
        jsonResponse({ access_token: 'graph-token' }),
        jsonResponse({ value: ['group-throttled'] }),
        jsonResponse({
          responses: [{ id: 'group-throttled', status: 429, body: {} }],
        }),
        jsonResponse({
          responses: [
            {
              id: 'group-throttled',
              status: 200,
              body: { id: 'group-throttled', displayName: 'Recovered Group' },
            },
          ],
        }),
      ]),
    });

    await jest.advanceTimersByTimeAsync(1000);
    const result = await syncPromise;
    jest.useRealTimers();

    expect(result).toMatchObject({ attempted: true, synced: true });
    expect(deps.upsertGroupByExternalId).toHaveBeenCalledWith(
      'group-throttled',
      'entra',
      { name: 'Recovered Group', email: undefined, description: undefined },
      undefined,
    );
  });

  it('ignores unresolved missing group details after retries', async () => {
    jest.useFakeTimers();
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    const deps = methods();
    const syncPromise = sync({
      methods: deps,
      fetcher: fetcher([
        jsonResponse({ token_endpoint: 'https://issuer.example.com/token' }),
        jsonResponse({ access_token: 'graph-token' }),
        jsonResponse({ value: ['group-unresolved'] }),
        jsonResponse({
          responses: [{ id: 'group-unresolved', status: 429, body: {} }],
        }),
        jsonResponse({
          responses: [{ id: 'group-unresolved', status: 429, body: {} }],
        }),
        jsonResponse({
          responses: [{ id: 'group-unresolved', status: 429, body: {} }],
        }),
      ]),
    });

    await jest.advanceTimersByTimeAsync(3000);
    const result = await syncPromise;
    jest.useRealTimers();

    expect(result).toMatchObject({ attempted: true, synced: true });
    expect(deps.upsertGroupByExternalId).not.toHaveBeenCalled();
    expect(deps.bulkUpdateGroups).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('continues syncing valid groups when Graph membership includes directory role ids', async () => {
    const existingGroup = { idOnTheSource: 'group-existing' } as IGroup;
    const deps = methods({
      findGroupsByExternalIds: mockMethod<UserGroupMethods['findGroupsByExternalIds']>(async () => [
        existingGroup,
      ]),
    });

    const result = await sync({
      graphConfig: { ...graphConfig, includeOwnersAsMembers: false },
      methods: deps,
      fetcher: fetcher([
        jsonResponse({ token_endpoint: 'https://issuer.example.com/token' }),
        jsonResponse({ access_token: 'graph-token' }),
        jsonResponse({ value: ['group-existing', 'group-new', 'directory-role'] }),
        jsonResponse({
          responses: [
            {
              id: 'group-new',
              status: 200,
              body: { id: 'group-new', displayName: 'New Group' },
            },
            {
              id: 'directory-role',
              status: 404,
              body: {},
            },
          ],
        }),
      ]),
    });

    expect(result).toMatchObject({ attempted: true, synced: true });
    expect(deps.upsertGroupByExternalId).toHaveBeenCalledWith(
      'group-new',
      'entra',
      { name: 'New Group', email: undefined, description: undefined },
      undefined,
    );
    expect(deps.bulkUpdateGroups).toHaveBeenLastCalledWith(
      {
        source: 'entra',
        memberIds: 'oid-123',
        idOnTheSource: { $nin: ['group-existing', 'group-new'] },
      },
      { $pullAll: { memberIds: ['oid-123'] } },
    );
  });

  it('does not sync groups when only the other lifecycle flag is enabled', async () => {
    const fetchMock = fetcher([]);

    const result = await sync({
      lifecycle: 'existing',
      options: { ...options, syncGroupsOnCreate: true, syncGroupsForExisting: false },
      fetcher: fetchMock,
    });

    expect(result).toEqual({ attempted: false, synced: false, reason: 'disabled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not remove stale memberships when graph returns no groups', async () => {
    const deps = methods();
    const result = await sync({
      graphConfig: { ...graphConfig, includeOwnersAsMembers: false },
      methods: deps,
      fetcher: fetcher([
        jsonResponse({ token_endpoint: 'https://issuer.example.com/token' }),
        jsonResponse({ access_token: 'graph-token' }),
        jsonResponse({ value: [] }),
      ]),
    });

    expect(result).toMatchObject({ attempted: true, synced: true });
    expect(deps.findGroupsByExternalIds).not.toHaveBeenCalled();
    expect(deps.upsertGroupByExternalId).not.toHaveBeenCalled();
    expect(deps.bulkUpdateGroups).not.toHaveBeenCalled();
  });

  it('rejects unsafe discovered token endpoints before OBO exchange', async () => {
    const deps = methods();
    const fetchMock = fetcher([jsonResponse({ token_endpoint: 'http://metadata.internal/token' })]);

    const result = await sync({ methods: deps, fetcher: fetchMock });

    expect(result).toEqual({ attempted: true, synced: false, reason: 'failed' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(deps.bulkUpdateGroups).not.toHaveBeenCalled();
  });

  it('logs failures and returns failed without throwing', async () => {
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    const result = await sync({
      fetcher: fetcher([
        jsonResponse({ token_endpoint: 'https://issuer.example.com/token' }),
        jsonResponse({}, { status: 400 }),
      ]),
    });

    expect(result).toEqual({ attempted: true, synced: false, reason: 'failed' });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('returns failed and logs when graph sync throws after token exchange', async () => {
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    const result = await sync({
      fetcher: fetcher([
        jsonResponse({ token_endpoint: 'https://issuer.example.com/token' }),
        jsonResponse({ access_token: 'graph-token' }),
        jsonResponse({}, { status: 503 }),
      ]),
    });

    expect(result).toEqual({ attempted: true, synced: false, reason: 'failed' });
    expect(errorSpy).toHaveBeenCalledWith(
      '[entraGroupSync] Error syncing remote Entra groups:',
      expect.objectContaining({
        lifecycle: 'existing',
        reason: 'failed',
        userId: expect.any(String),
      }),
      expect.any(Error),
    );
  });
});
