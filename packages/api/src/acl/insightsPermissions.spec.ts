import { PermissionBits, PrincipalType, ResourceType, SystemRoles } from 'librechat-data-provider';
import type { ServerRequest } from '~/types';
import {
  auditInsightsPermissionChanges,
  maskAgentInsightsBit,
  validateInsightsPermissionUpdates,
} from './insightsPermissions';

describe('Insights permissions', () => {
  test('allows only admins to assign a boolean agent Insights grant', () => {
    expect(
      validateInsightsPermissionUpdates({
        resourceType: ResourceType.AGENT,
        userRole: SystemRoles.USER,
        updatedPrincipals: [{ type: PrincipalType.USER, viewInsights: true }],
      }),
    ).toEqual({ status: 403, error: 'Only administrators can change Insights access' });
    expect(
      validateInsightsPermissionUpdates({
        resourceType: ResourceType.AGENT,
        userRole: SystemRoles.ADMIN,
        updatedPrincipals: [{ type: PrincipalType.USER, viewInsights: true }],
      }),
    ).toBeNull();
  });

  test('hides the Insights bit from non-admin effective permissions', () => {
    expect(
      maskAgentInsightsBit({
        resourceType: ResourceType.AGENT,
        userRole: SystemRoles.USER,
        permBits: PermissionBits.VIEW | PermissionBits.VIEW_INSIGHTS,
      }),
    ).toBe(PermissionBits.VIEW);
  });

  test('restores unaudited changes when fail-closed audit persistence fails', async () => {
    const restore = jest.fn().mockResolvedValue(undefined);
    const record = jest.fn().mockRejectedValue(new Error('audit unavailable'));
    const change = {
      action: 'assigned' as const,
      previousEntry: null,
      writtenEntry: null,
      principal: { type: PrincipalType.ROLE, id: SystemRoles.USER },
    };
    const req = {
      user: {
        _id: { toString: () => 'admin-id' },
        id: 'admin-id',
        email: 'admin@example.com',
        role: SystemRoles.ADMIN,
        tenantId: 'tenant-a',
      },
      headers: {},
    } as unknown as ServerRequest;

    await expect(
      auditInsightsPermissionChanges({
        req,
        resourceId: 'resource-id',
        changes: [change],
        failClosed: true,
        deps: {
          getAgent: jest.fn().mockResolvedValue({ id: 'agent-id', name: 'Agent' }),
          recordAuditEntry: record,
          restoreInsightsPermissionChanges: restore,
          logger: { error: jest.fn() },
        },
      }),
    ).rejects.toMatchObject({ statusCode: 500 });
    expect(restore).toHaveBeenCalledWith([change]);
  });

  test.each([true, false])(
    'still audits with the resource id when the agent lookup fails (failClosed=%p)',
    async (failClosed) => {
      const restore = jest.fn().mockResolvedValue(undefined);
      const record = jest.fn().mockResolvedValue(null);
      const logger = { error: jest.fn() };
      const req = {
        user: { _id: { toString: () => 'admin-id' }, id: 'admin-id', role: SystemRoles.ADMIN },
        headers: {},
      } as unknown as ServerRequest;

      await auditInsightsPermissionChanges({
        req,
        resourceId: 'resource-id',
        changes: [
          {
            action: 'assigned',
            previousEntry: null,
            writtenEntry: null,
            principal: { type: PrincipalType.ROLE, id: SystemRoles.USER },
          },
        ],
        failClosed,
        deps: {
          getAgent: jest.fn().mockRejectedValue(new Error('lookup down')),
          recordAuditEntry: record,
          restoreInsightsPermissionChanges: restore,
          logger,
        },
      });

      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'permission.insights_assigned',
          target: { type: ResourceType.AGENT, id: 'resource-id', name: 'resource-id' },
        }),
        { failClosed },
      );
      expect(restore).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalled();
    },
  );
});
