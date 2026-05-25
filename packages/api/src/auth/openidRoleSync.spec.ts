import { SystemRoles } from 'librechat-data-provider';
import {
  getOpenIdRoleSyncOptions,
  normalizeOpenIdRoleValues,
  parseOpenIdRoleSyncList,
  selectOpenIdRole,
} from './openidRoleSync';

describe('getOpenIdRoleSyncOptions', () => {
  it('defaults role sync and API role sync to disabled', () => {
    expect(getOpenIdRoleSyncOptions({})).toEqual({
      enabled: false,
      apiEnabled: false,
      claimSource: 'id',
      claim: undefined,
      rolePriority: [],
      fallbackRole: undefined,
    });
  });

  it('parses enabled config and comma-separated priority roles', () => {
    expect(
      getOpenIdRoleSyncOptions({
        OPENID_ROLE_SYNC_ENABLED: 'true',
        OPENID_ROLE_SYNC_API_ENABLED: 'true',
        OPENID_ROLE_SYNC_SOURCE: 'access',
        OPENID_ROLE_SYNC_CLAIM: 'roles',
        OPENID_ROLE_SYNC_ROLE_PRIORITY: 'STANDARD-USER, BASIC-USER',
        OPENID_ROLE_SYNC_FALLBACK_ROLE: SystemRoles.USER,
      }),
    ).toEqual({
      enabled: true,
      apiEnabled: true,
      claimSource: 'access',
      claim: 'roles',
      rolePriority: ['STANDARD-USER', 'BASIC-USER'],
      fallbackRole: SystemRoles.USER,
    });
  });

  it('requires claim when role sync is enabled', () => {
    expect(() => getOpenIdRoleSyncOptions({ OPENID_ROLE_SYNC_ENABLED: 'true' })).toThrow(
      'OPENID_ROLE_SYNC_CLAIM is required',
    );
  });

  it('rejects invalid claim sources', () => {
    expect(() =>
      getOpenIdRoleSyncOptions({
        OPENID_ROLE_SYNC_SOURCE: 'profile',
      }),
    ).toThrow('OPENID_ROLE_SYNC_SOURCE must be one of');
  });

  it('rejects API role sync when global role sync is disabled', () => {
    expect(() =>
      getOpenIdRoleSyncOptions({
        OPENID_ROLE_SYNC_API_ENABLED: 'true',
      }),
    ).toThrow('OPENID_ROLE_SYNC_API_ENABLED requires OPENID_ROLE_SYNC_ENABLED=true');
  });

  it('rejects ADMIN in role priority and fallback role', () => {
    expect(() =>
      getOpenIdRoleSyncOptions({
        OPENID_ROLE_SYNC_ROLE_PRIORITY: `STANDARD-USER,${SystemRoles.ADMIN}`,
      }),
    ).toThrow('OPENID_ROLE_SYNC_ROLE_PRIORITY cannot include ADMIN');

    expect(() =>
      getOpenIdRoleSyncOptions({
        OPENID_ROLE_SYNC_FALLBACK_ROLE: SystemRoles.ADMIN,
      }),
    ).toThrow('OPENID_ROLE_SYNC_FALLBACK_ROLE cannot be ADMIN');
  });
});

describe('parseOpenIdRoleSyncList', () => {
  it('parses comma-separated values and removes blanks', () => {
    expect(parseOpenIdRoleSyncList(' STANDARD-USER, ,BASIC-USER,')).toEqual([
      'STANDARD-USER',
      'BASIC-USER',
    ]);
  });
});

describe('normalizeOpenIdRoleValues', () => {
  it('normalizes values and deduplicates case-insensitively', () => {
    expect([
      ...normalizeOpenIdRoleValues([' BASIC-USER ', 'basic-user', '', 'STANDARD-USER', ' ']),
    ]).toEqual(['basic-user', 'standard-user']);
  });

  it('splits string values on whitespace and commas while excluding ADMIN', () => {
    expect([...normalizeOpenIdRoleValues(' BASIC-USER,standard-user ADMIN ')]).toEqual([
      'basic-user',
      'standard-user',
    ]);
  });

  it('returns an empty list for missing values', () => {
    expect(normalizeOpenIdRoleValues()).toEqual(new Set());
  });

  it('filters values that are not assignable roles', () => {
    expect([
      ...normalizeOpenIdRoleValues('BASIC-USER unknown STANDARD-USER', ['STANDARD-USER', 'USER']),
    ]).toEqual(['standard-user']);
  });

  it('ignores non-string array entries from malformed claims', () => {
    expect([
      ...normalizeOpenIdRoleValues(['STANDARD-USER', 123, null, false], ['STANDARD-USER']),
    ]).toEqual(['standard-user']);
  });
});

describe('selectOpenIdRole', () => {
  it('selects the highest-priority configured role from matching OpenID values', () => {
    expect(
      selectOpenIdRole({
        currentRole: SystemRoles.USER,
        openIdRoleValues: 'BASIC-USER STANDARD-USER',
        rolePriority: ['STANDARD-USER', 'BASIC-USER'],
      }),
    ).toEqual({
      selectedRole: 'STANDARD-USER',
      reason: 'matched_priority',
    });
  });

  it('matches roles case-insensitively and returns the configured canonical role name', () => {
    expect(
      selectOpenIdRole({
        openIdRoleValues: ['standard-user'],
        rolePriority: ['STANDARD-USER'],
      }).selectedRole,
    ).toBe('STANDARD-USER');
  });

  it('uses rolePriority as the ordered assignable role list', () => {
    expect(
      selectOpenIdRole({
        currentRole: 'BASIC-USER',
        openIdRoleValues: ['BASIC-USER', 'STANDARD-USER'],
        rolePriority: ['BASIC-USER', 'STANDARD-USER'],
      }),
    ).toEqual({
      selectedRole: 'BASIC-USER',
      reason: 'matched_priority',
    });
  });

  it('ignores token values that are not in rolePriority or fallbackRole', () => {
    expect(
      selectOpenIdRole({
        currentRole: SystemRoles.USER,
        openIdRoleValues: ['BASIC-USER', 'STANDARD-USER'],
        rolePriority: [],
      }),
    ).toEqual({
      reason: 'no_matching_role',
    });
  });

  it('applies fallback only when no configured role matches', () => {
    expect(
      selectOpenIdRole({
        currentRole: 'BASIC-USER',
        openIdRoleValues: ['UNKNOWN'],
        rolePriority: ['BASIC-USER'],
        fallbackRole: SystemRoles.USER,
      }),
    ).toEqual({
      selectedRole: SystemRoles.USER,
      reason: 'fallback',
    });
  });

  it('does not apply fallback when a priority role already matches', () => {
    expect(
      selectOpenIdRole({
        openIdRoleValues: ['BASIC-USER'],
        rolePriority: ['BASIC-USER'],
        fallbackRole: SystemRoles.USER,
      }),
    ).toEqual({
      selectedRole: 'BASIC-USER',
      reason: 'matched_priority',
    });
  });

  it('keeps the current fallback role when it is present in the OpenID values', () => {
    expect(
      selectOpenIdRole({
        currentRole: SystemRoles.USER,
        openIdRoleValues: [SystemRoles.USER],
        rolePriority: ['BASIC-USER'],
        fallbackRole: SystemRoles.USER,
      }),
    ).toEqual({
      selectedRole: SystemRoles.USER,
      reason: 'kept_current',
    });
  });

  it('does not keep a current role that is outside rolePriority and fallbackRole', () => {
    expect(
      selectOpenIdRole({
        currentRole: 'LOCAL-ROLE',
        openIdRoleValues: ['LOCAL-ROLE'],
        rolePriority: ['STANDARD-USER'],
        fallbackRole: SystemRoles.USER,
      }),
    ).toEqual({
      selectedRole: SystemRoles.USER,
      reason: 'fallback',
    });
  });

  it('selects fallback when the fallback role is present and no priority role matches', () => {
    expect(
      selectOpenIdRole({
        currentRole: 'BASIC-USER',
        openIdRoleValues: [SystemRoles.USER],
        rolePriority: ['STANDARD-USER'],
        fallbackRole: SystemRoles.USER,
      }),
    ).toEqual({
      selectedRole: SystemRoles.USER,
      reason: 'fallback',
    });
  });

  it('excludes ADMIN from generic matching and fallback assignment', () => {
    expect(
      selectOpenIdRole({
        openIdRoleValues: [SystemRoles.ADMIN],
        rolePriority: [SystemRoles.ADMIN],
        fallbackRole: SystemRoles.ADMIN,
      }),
    ).toEqual({
      reason: 'no_matching_role',
    });
  });

  it('ignores unknown normalized values without affecting priority selection', () => {
    expect(
      selectOpenIdRole({
        openIdRoleValues: ['UNKNOWN', 'unknown', 'BASIC-USER', 'ignored'],
        rolePriority: ['BASIC-USER'],
      }),
    ).toEqual({
      selectedRole: 'BASIC-USER',
      reason: 'matched_priority',
    });
  });
});
