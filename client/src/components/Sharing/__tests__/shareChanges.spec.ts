import { AccessRoleIds, PrincipalType } from 'librechat-data-provider';
import type { TPrincipal } from 'librechat-data-provider';
import { computeShareChanges, principalKey } from '../shareChanges';

const principal = (over: Partial<TPrincipal>): TPrincipal => ({
  type: PrincipalType.USER,
  id: 'id',
  name: 'name',
  accessRoleId: AccessRoleIds.AGENT_VIEWER,
  ...over,
});

describe('computeShareChanges', () => {
  it('does not revoke a principal when the same id appears with a different idOnTheSource', () => {
    // Loaded ACL returns the owner keyed by the external oid...
    const currentShares = [
      principal({
        id: 'owner',
        accessRoleId: AccessRoleIds.AGENT_OWNER,
        idOnTheSource: 'entra-oid-abc',
      }),
    ];
    // ...while the working list (people-picker) carries the local `_id`.
    const allShares = [
      principal({ id: 'owner', accessRoleId: AccessRoleIds.AGENT_OWNER, idOnTheSource: 'owner' }),
      principal({
        id: 'viewer',
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        idOnTheSource: 'viewer',
      }),
    ];

    const { updated, removed } = computeShareChanges(currentShares, allShares);

    expect(removed.some((p) => p.id === 'owner')).toBe(false);
    expect(updated.some((p) => p.id === 'viewer')).toBe(true);
  });

  it('still revokes a principal that is genuinely gone from the working list', () => {
    const currentShares = [
      principal({ id: 'owner', accessRoleId: AccessRoleIds.AGENT_OWNER, idOnTheSource: 'owner' }),
      principal({ id: 'gone', accessRoleId: AccessRoleIds.AGENT_VIEWER, idOnTheSource: 'gone' }),
    ];
    const allShares = [
      principal({ id: 'owner', accessRoleId: AccessRoleIds.AGENT_OWNER, idOnTheSource: 'owner' }),
    ];

    const { removed } = computeShareChanges(currentShares, allShares);
    expect(removed.map((p) => p.id)).toEqual(['gone']);
  });

  it('falls back to idOnTheSource for principals without a local id (unsynced Entra)', () => {
    const currentShares = [
      principal({
        type: PrincipalType.GROUP,
        id: undefined,
        idOnTheSource: 'group-oid',
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
      }),
    ];
    const allShares: TPrincipal[] = [];

    const { removed } = computeShareChanges(currentShares, allShares);
    expect(removed.some((p) => p.idOnTheSource === 'group-oid')).toBe(true);
    expect(principalKey(currentShares[0])).toBe(`${PrincipalType.GROUP}-group-oid`);
  });
});
