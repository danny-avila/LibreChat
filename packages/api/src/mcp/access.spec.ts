import type { ParsedServerConfig } from './types';
import { getUserRoles } from '~/mssql';
import {
  parseServerRoleIds,
  canAccessMCPServer,
  filterMCPServersByRoles,
  filterMCPServersForUser,
  resolveUserMCPRoleIds,
  userCanAccessMCPServer,
} from './access';

/** getUserRoles reaches the external Sapphire MSSQL DB — mock that boundary only. */
jest.mock('~/mssql', () => ({ getUserRoles: jest.fn() }));

const mockGetUserRoles = getUserRoles as jest.MockedFunction<typeof getUserRoles>;

const cfg = (roles?: string): ParsedServerConfig =>
  ({ type: 'streamable-http', url: 'https://example.com/mcp', roles }) as ParsedServerConfig;

const spyRoles = (ids: string[]) =>
  mockGetUserRoles.mockResolvedValue(ids.map((id) => ({ id, name: id.toUpperCase() })));

afterEach(() => {
  jest.clearAllMocks();
});

describe('parseServerRoleIds', () => {
  it('returns [] for omitted/empty', () => {
    expect(parseServerRoleIds(undefined)).toEqual([]);
    expect(parseServerRoleIds('')).toEqual([]);
    expect(parseServerRoleIds('  ,  ')).toEqual([]);
  });

  it('splits, trims, lowercases, and drops empties', () => {
    expect(parseServerRoleIds('TestSapphireRole, RCM ,, admin')).toEqual([
      'testsapphirerole',
      'rcm',
      'admin',
    ]);
  });
});

describe('canAccessMCPServer', () => {
  it('grants any user when no roles gate is set', () => {
    expect(canAccessMCPServer(cfg(), new Set())).toBe(true);
  });

  it('grants when the user holds any one required role (case-insensitive)', () => {
    expect(canAccessMCPServer(cfg('RCM,TestSapphireRole'), new Set(['rcm']))).toBe(true);
  });

  it('denies when the user holds none of the required roles', () => {
    expect(canAccessMCPServer(cfg('RCM'), new Set(['other']))).toBe(false);
    expect(canAccessMCPServer(cfg('RCM'), new Set())).toBe(false);
  });
});

describe('filterMCPServersByRoles', () => {
  it('keeps ungated servers and gated servers the user can access', () => {
    const servers = {
      open: cfg(),
      gatedAllowed: cfg('RCM'),
      gatedDenied: cfg('admin'),
    };
    const result = filterMCPServersByRoles(servers, new Set(['rcm']));
    expect(Object.keys(result).sort()).toEqual(['gatedAllowed', 'open']);
  });
});

describe('filterMCPServersForUser', () => {
  it('skips the DB entirely when no server declares a roles gate', async () => {
    const spy = spyRoles(['rcm']);
    const servers = { open: cfg(), alsoOpen: cfg('') };

    const result = await filterMCPServersForUser(servers, { idOnTheSource: 'oid-1' });

    expect(result).toEqual(servers);
    expect(spy).not.toHaveBeenCalled();
  });

  it('resolves roles and filters once any server is gated', async () => {
    const spy = spyRoles(['rcm']);
    const servers = { open: cfg(), gatedAllowed: cfg('RCM'), gatedDenied: cfg('admin') };

    const result = await filterMCPServersForUser(servers, { idOnTheSource: 'oid-2' });

    expect(Object.keys(result).sort()).toEqual(['gatedAllowed', 'open']);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('drops gated servers for a user with no object id without querying', async () => {
    const spy = spyRoles(['rcm']);
    const servers = { open: cfg(), gated: cfg('RCM') };

    const result = await filterMCPServersForUser(servers, null);

    expect(Object.keys(result)).toEqual(['open']);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('resolveUserMCPRoleIds', () => {
  it('returns an empty set and skips the DB when idOnTheSource is missing', async () => {
    const spy = spyRoles(['rcm']);
    expect(await resolveUserMCPRoleIds(null)).toEqual(new Set());
    expect(await resolveUserMCPRoleIds({ idOnTheSource: undefined })).toEqual(new Set());
    expect(spy).not.toHaveBeenCalled();
  });

  it('lowercases role ids and caches by object id (one DB call for repeats)', async () => {
    const spy = spyRoles(['RCM', 'TestSapphireRole']);
    const user = { idOnTheSource: 'oid-cache-1' };
    const first = await resolveUserMCPRoleIds(user);
    const second = await resolveUserMCPRoleIds(user);
    expect(first).toEqual(new Set(['rcm', 'testsapphirerole']));
    expect(second).toEqual(first);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the role lookup yields no roles', async () => {
    spyRoles([]);
    expect(await resolveUserMCPRoleIds({ idOnTheSource: 'oid-empty-1' })).toEqual(new Set());
  });
});

describe('userCanAccessMCPServer', () => {
  it('allows an undefined server config (no roles gate to enforce)', async () => {
    const spy = spyRoles(['rcm']);
    expect(await userCanAccessMCPServer(undefined, { idOnTheSource: 'oid-x' })).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('grants an ungated server without resolving roles', async () => {
    const spy = spyRoles(['rcm']);
    expect(await userCanAccessMCPServer(cfg(), { idOnTheSource: 'oid-ungated' })).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('gates a role-restricted server on the user roles', async () => {
    spyRoles(['rcm']);
    expect(await userCanAccessMCPServer(cfg('RCM'), { idOnTheSource: 'oid-allow-1' })).toBe(true);
    expect(await userCanAccessMCPServer(cfg('admin'), { idOnTheSource: 'oid-deny-1' })).toBe(false);
  });

  it('denies a gated server for a user with no object id (fail closed)', async () => {
    const spy = spyRoles(['rcm']);
    expect(await userCanAccessMCPServer(cfg('RCM'), { idOnTheSource: undefined })).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
