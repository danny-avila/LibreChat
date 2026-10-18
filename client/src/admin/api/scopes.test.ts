import { PrincipalType } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import { createFakeAdminApi } from '~/admin/test/admin';

const yaml: t.ConfigRecord = {
  endpoints: {
    custom: [
      {
        name: 'first',
        apiKey: 'user_provided',
        baseURL: 'https://first.example.com',
        models: { default: ['m'] },
      },
      {
        name: 'second',
        apiKey: 'user_provided',
        baseURL: 'https://second.example.com',
        models: { default: ['m'] },
      },
    ],
  },
};

const mockApi = {
  current: undefined as ReturnType<typeof createFakeAdminApi> | undefined,
};

jest.mock('./utils/api', () => ({
  apiFetch: (path: string, init?: RequestInit) => mockApi.current!.fetch(path, init),
  extractApiError: async (_response: unknown, message: string) => {
    throw new Error(message);
  },
}));

jest.mock('~/admin/query', () => ({ queryOptions: (opts: unknown) => opts }));

import { applyConfigChanges } from './config';
import { MISSING_SCOPE_MESSAGE } from './scopes';

const principal = { principalType: PrincipalType.ROLE, principalId: 'ADMIN' };
const admin: t.WriteTargetRef = { type: 'scope', scope: principal };

function sets(entries: Array<[string, t.ConfigValue]>): t.ConfigChange[] {
  return entries.map(([path, value]): t.ConfigChange => ({ op: 'set', path, value }));
}

beforeEach(() => {
  mockApi.current = createFakeAdminApi(yaml);
  mockApi.current.seed('role/ADMIN', {});
});

describe('profile writes', () => {
  it('saves an indexed entry by its name, never over another entry', async () => {
    await applyConfigChanges(
      admin,
      sets([
        [
          'endpoints.custom.0',
          { name: 'second', apiKey: 'user_provided', baseURL: 'https://edited.example.com' },
        ],
      ]),
    );
    expect(mockApi.current!.stored('role/ADMIN')).toEqual({
      endpoints: { custom: [{ name: 'second', baseURL: 'https://edited.example.com' }] },
    });
  });

  it('explains why a path cannot be set per profile', async () => {
    const result = await applyConfigChanges(
      admin,
      sets([['filters.messages.pii.action', 'block']]),
    );
    expect(result.skipped).toEqual([
      { fieldPath: 'filters.messages.pii.action', reason: 'baseOnly' },
    ]);
    expect(mockApi.current!.writes()).toEqual([]);
  });

  it('reports skipped paths and the applied count', async () => {
    const result = await applyConfigChanges(
      admin,
      sets([
        ['balance.startBalance', 5],
        ['interface.prompts', false],
      ]),
    );
    expect(result).toMatchObject({
      applied: 1,
      skipped: [{ fieldPath: 'interface.prompts', reason: 'permission' }],
    });
  });

  it('tombstones only on an explicit hide', async () => {
    await applyConfigChanges(admin, [{ op: 'tombstone', path: 'endpoints.custom' }]);
    expect(mockApi.current!.tombstones('role/ADMIN')).toEqual(['endpoints.custom']);
  });
});

describe('profile writes and scope gating (WS8)', () => {
  it('skips sections that apply to everyone, writing the rest', async () => {
    const result = await applyConfigChanges(
      admin,
      sets([
        ['interface.parameters', true],
        ['registration.socialLogins', ['github']],
      ]),
    );
    expect(result).toMatchObject({
      applied: 1,
      skipped: [{ fieldPath: 'registration.socialLogins', reason: 'baseScope' }],
    });
    expect(mockApi.current!.stored('role/ADMIN')).toEqual({ interface: { parameters: true } });
  });

  it('removes a stale value a gated section still stores (PR-7)', async () => {
    mockApi.current!.seed('role/ADMIN', { registration: { socialLogins: ['github'] } });
    const result = await applyConfigChanges(admin, [
      { op: 'reset', path: 'registration.socialLogins' },
    ]);
    expect(result.skipped).toEqual([]);
    expect(mockApi.current!.stored('role/ADMIN')).toEqual({});
  });

  it('refuses to write into a deleted profile, so a save never recreates it', async () => {
    const gone: t.WriteTargetRef = {
      type: 'scope',
      scope: { principalType: PrincipalType.GROUP, principalId: 'gone' },
    };
    await expect(applyConfigChanges(gone, sets([['interface.parameters', true]]))).rejects.toThrow(
      MISSING_SCOPE_MESSAGE,
    );
    expect(mockApi.current!.stored('group/gone')).toBeUndefined();
  });
});
