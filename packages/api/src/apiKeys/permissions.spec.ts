import { Types } from 'mongoose';
import {
  ResourceType,
  PrincipalType,
  PermissionBits,
  AccessRoleIds,
} from 'librechat-data-provider';
import { enrichRemoteAgentPrincipals } from './permissions';
import type { EnricherDependencies, Principal } from './permissions';

/**
 * Tests for `enrichRemoteAgentPrincipals`.
 *
 * The function is purely dependency-injected, so we stub `aggregateAclEntries`
 * with fake rows. The critical assertion for the Cosmos DB fix is that the
 * application-layer `(permBits & SHARE) === SHARE` filter excludes rows the
 * aggregation no longer filters itself — previously the `$bitsAllSet` match
 * stage guaranteed every row included SHARE, so removing that filter without
 * a JS replacement would silently enrich non-owners.
 */
describe('enrichRemoteAgentPrincipals', () => {
  const resourceId = new Types.ObjectId();
  const sharerUserId = new Types.ObjectId();
  const nonSharerUserId = new Types.ObjectId();

  function makeUserInfo(id: Types.ObjectId, overrides: Record<string, unknown> = {}) {
    return {
      _id: id,
      name: `user-${id.toString().slice(-4)}`,
      email: `${id.toString().slice(-4)}@test.local`,
      avatar: 'avatar.png',
      idOnTheSource: id.toString(),
      ...overrides,
    };
  }

  function makeDeps(aggregateResult: Record<string, unknown>[]): EnricherDependencies {
    return {
      aggregateAclEntries: jest.fn().mockResolvedValue(aggregateResult),
      bulkWriteAclEntries: jest.fn(),
      findRoleByIdentifier: jest.fn(),
      logger: { error: jest.fn() },
    };
  }

  test('excludes entries whose permBits lack the SHARE bit', async () => {
    const deps = makeDeps([
      {
        principalId: sharerUserId,
        permBits: PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.SHARE,
        userInfo: makeUserInfo(sharerUserId),
      },
      {
        principalId: nonSharerUserId,
        permBits: PermissionBits.VIEW | PermissionBits.EDIT,
        userInfo: makeUserInfo(nonSharerUserId),
      },
    ]);

    const result = await enrichRemoteAgentPrincipals(deps, resourceId, []);

    expect(result.principals).toHaveLength(1);
    expect(result.principals[0].id).toBe(sharerUserId.toString());
    expect(result.principals[0].accessRoleId).toBe(AccessRoleIds.REMOTE_AGENT_OWNER);
    expect(result.principals[0].isImplicit).toBe(true);
    expect(result.entriesToBackfill).toHaveLength(1);
    expect(result.entriesToBackfill[0].toString()).toBe(sharerUserId.toString());
  });

  test('includes entries whose permBits are a strict superset of SHARE', async () => {
    const fullPerms =
      PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE | PermissionBits.SHARE;
    const deps = makeDeps([
      {
        principalId: sharerUserId,
        permBits: fullPerms,
        userInfo: makeUserInfo(sharerUserId),
      },
    ]);

    const result = await enrichRemoteAgentPrincipals(deps, resourceId, []);

    expect(result.principals).toHaveLength(1);
    expect(result.entriesToBackfill).toHaveLength(1);
  });

  test('excludes entries whose permBits are zero', async () => {
    const deps = makeDeps([
      {
        principalId: sharerUserId,
        permBits: 0,
        userInfo: makeUserInfo(sharerUserId),
      },
    ]);

    const result = await enrichRemoteAgentPrincipals(deps, resourceId, []);

    expect(result.principals).toHaveLength(0);
    expect(result.entriesToBackfill).toHaveLength(0);
  });

  test('skips entries that have SHARE but no resolved user info', async () => {
    const deps = makeDeps([
      {
        principalId: sharerUserId,
        permBits: PermissionBits.SHARE,
        userInfo: null,
      },
    ]);

    const result = await enrichRemoteAgentPrincipals(deps, resourceId, []);

    expect(result.principals).toHaveLength(0);
    expect(result.entriesToBackfill).toHaveLength(0);
  });

  test('does not duplicate a principal already present in the input list', async () => {
    const existing: Principal = {
      type: PrincipalType.USER,
      id: sharerUserId.toString(),
      name: 'already-there',
      accessRoleId: AccessRoleIds.REMOTE_AGENT_OWNER,
    };
    const deps = makeDeps([
      {
        principalId: sharerUserId,
        permBits: PermissionBits.SHARE,
        userInfo: makeUserInfo(sharerUserId),
      },
    ]);

    const result = await enrichRemoteAgentPrincipals(deps, resourceId, [existing]);

    expect(result.principals).toHaveLength(1);
    expect(result.principals[0].name).toBe('already-there');
    expect(result.entriesToBackfill).toHaveLength(0);
  });

  test('accepts resourceId as a 24-char hex string and passes an ObjectId to the aggregation', async () => {
    const hexId = new Types.ObjectId().toString();
    const aggregateAclEntries = jest.fn().mockResolvedValue([]);
    const deps: EnricherDependencies = {
      aggregateAclEntries,
      bulkWriteAclEntries: jest.fn(),
      findRoleByIdentifier: jest.fn(),
      logger: { error: jest.fn() },
    };

    await enrichRemoteAgentPrincipals(deps, hexId, []);

    const pipeline = aggregateAclEntries.mock.calls[0][0];
    const matchStage = pipeline[0].$match;
    expect(matchStage.resourceType).toBe(ResourceType.AGENT);
    expect(matchStage.principalType).toBe(PrincipalType.USER);
    expect(matchStage.resourceId).toBeInstanceOf(Types.ObjectId);
    expect((matchStage.resourceId as Types.ObjectId).toString()).toBe(hexId);
    /** Regression guard: the $match must NOT filter permBits via $bitsAllSet. */
    expect(matchStage.permBits).toBeUndefined();
  });
});
