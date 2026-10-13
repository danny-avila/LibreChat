import { PrincipalType, ResourceType } from 'librechat-data-provider';
import type { InsightsPermissionChange } from './insightsPermissions';
import type { ServerRequest } from '~/types';
import { auditResourcePermissionChanges } from './audit';

const req = {
  user: { _id: { toString: () => 'actor-id' }, id: 'actor-id', name: 'Actor', tenantId: 't1' },
  headers: {},
} as unknown as ServerRequest;

const grantChange = (id: string, permBits = 3): InsightsPermissionChange =>
  ({
    action: 'assigned',
    previousEntry: null,
    writtenEntry: { permBits, roleId: 'r1' },
    principal: { type: PrincipalType.USER, id, name: 'Secret Name' },
  }) as unknown as InsightsPermissionChange;

function setup(recordImpl?: jest.Mock) {
  const recordAuditEntry = recordImpl ?? jest.fn().mockResolvedValue(null);
  const restorePermissionChanges = jest.fn().mockResolvedValue(undefined);
  const logger = { error: jest.fn() };
  const run = (changes: InsightsPermissionChange[], failClosed: boolean, r = req) =>
    auditResourcePermissionChanges({
      req: r,
      resourceType: ResourceType.PROMPTGROUP,
      resourceId: 'res-1',
      changes,
      failClosed,
      deps: { recordAuditEntry, restorePermissionChanges, logger },
    });
  return { recordAuditEntry, restorePermissionChanges, logger, run };
}

describe('auditResourcePermissionChanges', () => {
  test('records grant, revoke and public entries with ids and bits only', async () => {
    const { recordAuditEntry, run } = setup();
    await run(
      [
        grantChange('u1'),
        {
          action: 'removed',
          previousEntry: { permBits: 1, roleId: 'r1' },
          writtenEntry: null,
          principal: { type: PrincipalType.GROUP, id: 'g1', name: 'Secret Name' },
        } as unknown as InsightsPermissionChange,
        {
          action: 'removed',
          previousEntry: { permBits: 1, roleId: 'r1' },
          writtenEntry: null,
          principal: { type: PrincipalType.PUBLIC, id: null },
        } as unknown as InsightsPermissionChange,
      ],
      true,
    );

    const inputs = recordAuditEntry.mock.calls.map(([input]) => input);
    expect(inputs.map((i) => i.action)).toEqual([
      'acl.granted',
      'acl.revoked',
      'acl.public_changed',
    ]);
    expect(inputs[0]).toEqual(
      expect.objectContaining({
        target: { type: ResourceType.PROMPTGROUP, id: 'res-1' },
        tenantId: 't1',
        metadata: { principalType: 'user', principalId: 'u1', permBits: 3, previousPermBits: 0 },
      }),
    );
    expect(inputs[2].metadata).toEqual(expect.objectContaining({ enabled: false }));
    expect(JSON.stringify(inputs)).not.toContain('Secret Name');
    expect(recordAuditEntry.mock.calls[0][1]).toEqual({ failClosed: true });
  });

  test('skips a grant that changes nothing', async () => {
    const { recordAuditEntry, run } = setup();
    await run(
      [
        {
          ...grantChange('u1'),
          previousEntry: { permBits: 3, roleId: 'r1' },
        } as unknown as InsightsPermissionChange,
      ],
      true,
    );
    expect(recordAuditEntry).not.toHaveBeenCalled();
  });

  test('fail-closed: restores the unaudited tail and throws', async () => {
    const record = jest.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('down'));
    const { restorePermissionChanges, run } = setup(record);
    const changes = [grantChange('u1'), grantChange('u2'), grantChange('u3')];

    await expect(run(changes, true)).rejects.toMatchObject({ statusCode: 500 });
    expect(restorePermissionChanges).toHaveBeenCalledWith(changes.slice(1));
  });

  test('fail-closed: restores everything when there is no authenticated actor', async () => {
    const { recordAuditEntry, restorePermissionChanges, run } = setup();
    const changes = [grantChange('u1')];

    await expect(run(changes, true, { headers: {} } as unknown as ServerRequest)).rejects.toThrow();
    expect(restorePermissionChanges).toHaveBeenCalledWith(changes);
    expect(recordAuditEntry).not.toHaveBeenCalled();
  });

  test('opt-out: logs a failed write, keeps the change and continues', async () => {
    const record = jest.fn().mockRejectedValue(new Error('down'));
    const { restorePermissionChanges, logger, run } = setup(record);

    await expect(run([grantChange('u1'), grantChange('u2')], false)).resolves.toBeUndefined();
    expect(record).toHaveBeenCalledTimes(2);
    expect(restorePermissionChanges).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  test('mixed ACL and Insights changes run as one pass and restore the unaudited tail', async () => {
    const record = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('down'));
    const { restorePermissionChanges } = setup(record);
    const acl = [grantChange('u1'), grantChange('u2')];
    const insightsChange = {
      ...grantChange('u2'),
      action: 'assigned',
    } as InsightsPermissionChange;
    const getAgent = jest.fn().mockResolvedValue({ id: 'res-1', name: 'Agent' });

    await expect(
      auditResourcePermissionChanges({
        req,
        resourceType: ResourceType.AGENT,
        resourceId: 'res-1',
        changes: acl,
        insights: { changes: [insightsChange], getAgent },
        failClosed: true,
        deps: { recordAuditEntry: record, restorePermissionChanges, logger: { error: jest.fn() } },
      }),
    ).rejects.toMatchObject({ statusCode: 500 });

    expect(record.mock.calls.map(([input]) => input.action)).toEqual([
      'acl.granted',
      'acl.granted',
      'permission.insights_assigned',
    ]);
    expect(restorePermissionChanges).toHaveBeenCalledWith([insightsChange]);
  });
});
